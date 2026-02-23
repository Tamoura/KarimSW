/**
 * Anchor Processor Tests
 *
 * Tests for the background anchor processor that picks up PENDING anchors,
 * polls SUBMITTED anchors, and retries FAILED anchors.
 * Uses mocked anchoring service — no real blockchain calls.
 */

import { PrismaClient } from '@prisma/client';

// Mock the anchoring service
const mockSubmitAnchor = jest.fn();
const mockCheckConfirmation = jest.fn();
const mockRetryFailed = jest.fn();

jest.mock('../../src/services/anchoring.service', () => ({
  submitAnchor: (...args: unknown[]) => mockSubmitAnchor(...args),
  checkConfirmation: (...args: unknown[]) => mockCheckConfirmation(...args),
  retryFailed: (...args: unknown[]) => mockRetryFailed(...args),
}));

import {
  startAnchorProcessor,
  processAnchorsOnce,
} from '../../src/services/anchor-processor';

const prisma = new PrismaClient();
const entityPrefix = 'proc-test-' + Date.now();

const TEST_CONFIG = {
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  privateKey: '0x' + 'a'.repeat(64),
  contractAddress: '0x' + '1'.repeat(40),
};

describe('Anchor Processor', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubmitAnchor.mockResolvedValue({ status: 'SUBMITTED' });
    mockCheckConfirmation.mockResolvedValue({ status: 'CONFIRMED' });
    mockRetryFailed.mockResolvedValue({ status: 'SUBMITTED' });
    // Clean up test anchors from previous runs
    await prisma.blockchainAnchor.deleteMany({
      where: { entityId: { startsWith: 'proc-test-' } },
    });
  });

  afterAll(async () => {
    await prisma.blockchainAnchor.deleteMany({
      where: { entityId: { startsWith: 'proc-test-' } },
    });
    await prisma.$disconnect();
  });

  describe('processAnchorsOnce', () => {
    it('should call submitAnchor for PENDING anchors', async () => {
      // Count pre-existing PENDING anchors
      const preExisting = await prisma.blockchainAnchor.count({
        where: { status: 'PENDING' },
      });

      // Add our test anchor
      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-pending',
          chain: 'POLYGON',
          dataHash: 'a'.repeat(64),
          status: 'PENDING',
        },
      });

      // Use large batch to include our anchor plus pre-existing
      await processAnchorsOnce(prisma, TEST_CONFIG, preExisting + 10);

      // Should have been called for at least our anchor
      expect(mockSubmitAnchor.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should call checkConfirmation for SUBMITTED anchors', async () => {
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'CREDENTIAL',
          entityId: entityPrefix + '-submitted',
          chain: 'POLYGON',
          dataHash: 'b'.repeat(64),
          status: 'SUBMITTED',
          transactionHash: '0xfake123',
        },
      });

      await processAnchorsOnce(prisma, TEST_CONFIG);

      const calledIds = mockCheckConfirmation.mock.calls.map(
        (c: unknown[]) => c[1]
      );
      expect(calledIds).toContain(anchor.id);
    });

    it('should call retryFailed for FAILED anchors with retryCount < 3', async () => {
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'REVOCATION',
          entityId: entityPrefix + '-failed',
          chain: 'POLYGON',
          dataHash: 'c'.repeat(64),
          status: 'FAILED',
          retryCount: 1,
          errorMessage: 'gas too low',
        },
      });

      await processAnchorsOnce(prisma, TEST_CONFIG);

      const calledIds = mockRetryFailed.mock.calls.map(
        (c: unknown[]) => c[1]
      );
      expect(calledIds).toContain(anchor.id);
    });

    it('should continue processing when submitAnchor throws', async () => {
      // Set all existing PENDING to CONFIRMED to isolate
      await prisma.blockchainAnchor.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });

      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-err-submit-1',
          chain: 'POLYGON',
          dataHash: 'e'.repeat(64),
          status: 'PENDING',
        },
      });
      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-err-submit-2',
          chain: 'POLYGON',
          dataHash: 'f'.repeat(64),
          status: 'PENDING',
        },
      });

      // First call throws, second succeeds
      mockSubmitAnchor
        .mockRejectedValueOnce(new Error('rpc error'))
        .mockResolvedValueOnce({ status: 'SUBMITTED' });

      await processAnchorsOnce(prisma, TEST_CONFIG);

      // Both should have been called despite first failure
      expect(mockSubmitAnchor).toHaveBeenCalledTimes(2);
    });

    it('should continue processing when checkConfirmation throws', async () => {
      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-err-confirm',
          chain: 'POLYGON',
          dataHash: 'e'.repeat(64),
          status: 'SUBMITTED',
          transactionHash: '0xerr1',
        },
      });

      mockCheckConfirmation.mockRejectedValueOnce(new Error('rpc error'));

      // Should not throw
      await processAnchorsOnce(prisma, TEST_CONFIG);

      expect(mockCheckConfirmation).toHaveBeenCalled();
    });

    it('should continue processing when retryFailed throws', async () => {
      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-err-retry',
          chain: 'POLYGON',
          dataHash: 'e'.repeat(64),
          status: 'FAILED',
          retryCount: 1,
          errorMessage: 'gas too low',
        },
      });

      mockRetryFailed.mockRejectedValueOnce(new Error('rpc error'));

      // Should not throw
      await processAnchorsOnce(prisma, TEST_CONFIG);

      expect(mockRetryFailed).toHaveBeenCalled();
    });

    it('should NOT retry FAILED anchors with retryCount >= 3', async () => {
      await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: entityPrefix + '-maxretry',
          chain: 'POLYGON',
          dataHash: 'd'.repeat(64),
          status: 'FAILED',
          retryCount: 3,
          errorMessage: 'permanently failed',
        },
      });

      await processAnchorsOnce(prisma, TEST_CONFIG);

      expect(mockRetryFailed).not.toHaveBeenCalled();
    });

    it('should limit PENDING batch to default size of 10', async () => {
      // First, set all existing PENDING anchors to CONFIRMED so they
      // don't interfere with the batch count
      await prisma.blockchainAnchor.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });

      // Create exactly 12 PENDING anchors
      for (let i = 0; i < 12; i++) {
        await prisma.blockchainAnchor.create({
          data: {
            entityType: 'DID',
            entityId: `${entityPrefix}-batch-${i}`,
            chain: 'POLYGON',
            dataHash: String(i).padStart(64, '0'),
            status: 'PENDING',
          },
        });
      }

      // Use default batch size (10)
      await processAnchorsOnce(prisma, TEST_CONFIG);

      expect(mockSubmitAnchor).toHaveBeenCalledTimes(10);

      // Restore: set CONFIRMED back to PENDING for those we changed
      // (not needed if other tests clean up, but safe)
    });
  });

  describe('startAnchorProcessor', () => {
    it('should return a cleanup function that stops the interval', () => {
      jest.useFakeTimers();

      const stop = startAnchorProcessor(prisma, TEST_CONFIG, {
        intervalMs: 1000,
      });

      expect(typeof stop).toBe('function');

      // Cleanup
      stop();

      // After stop, advancing time should not trigger calls
      jest.advanceTimersByTime(5000);
      // The mock should not have been called because we stopped
      // before any interval fired
      expect(mockSubmitAnchor).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
