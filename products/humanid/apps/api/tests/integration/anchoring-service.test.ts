/**
 * Anchoring Service Tests
 *
 * Tests for submitAnchor, checkConfirmation, and retryFailed.
 * Uses mocked ethers provider — no real RPC calls.
 */

import { PrismaClient, AnchorStatus } from '@prisma/client';
import {
  submitAnchor,
  checkConfirmation,
  retryFailed,
  AnchoringConfig,
} from '../../src/services/anchoring.service';

// Mock ethers module
jest.mock('ethers', () => {
  const mockWait = jest.fn().mockResolvedValue({
    hash: '0xabc123confirmed',
    blockNumber: 42,
  });
  const mockSendTransaction = jest.fn().mockResolvedValue({
    hash: '0xabc123',
    wait: mockWait,
  });
  const mockGetTransactionReceipt = jest.fn();
  const mockGetBlock = jest.fn();
  const mockGetBlockNumber = jest.fn().mockResolvedValue(100);
  const mockFeeData = jest.fn().mockResolvedValue({
    gasPrice: BigInt('20000000000'), // 20 gwei
    maxFeePerGas: BigInt('30000000000'),
    maxPriorityFeePerGas: BigInt('1000000000'),
  });

  return {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getTransactionReceipt: mockGetTransactionReceipt,
      getBlock: mockGetBlock,
      getBlockNumber: mockGetBlockNumber,
      getFeeData: mockFeeData,
    })),
    Wallet: jest.fn().mockImplementation(() => ({
      sendTransaction: mockSendTransaction,
      connect: jest.fn().mockReturnThis(),
    })),
    Contract: jest.fn().mockImplementation(() => ({
      anchor: jest.fn().mockResolvedValue({
        hash: '0xcontract123',
        wait: mockWait,
      }),
    })),
    id: jest.fn((val: string) => '0x' + val.padEnd(64, '0')),
    __mockSendTransaction: mockSendTransaction,
    __mockGetTransactionReceipt: mockGetTransactionReceipt,
    __mockGetBlock: mockGetBlock,
    __mockGetBlockNumber: mockGetBlockNumber,
    __mockFeeData: mockFeeData,
    __mockWait: mockWait,
  };
});

const ethers = require('ethers');

const prisma = new PrismaClient();

const TEST_CONFIG: AnchoringConfig = {
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  privateKey: '0x' + 'a'.repeat(64),
  contractAddress: '0x' + '1'.repeat(40),
};

describe('Anchoring Service', () => {
  let anchorId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create a test PENDING anchor
    const anchor = await prisma.blockchainAnchor.create({
      data: {
        entityType: 'DID',
        entityId: 'test-entity-' + Date.now(),
        chain: 'POLYGON',
        dataHash: 'a'.repeat(64),
        status: 'PENDING',
      },
    });
    anchorId = anchor.id;
  });

  afterEach(async () => {
    await prisma.blockchainAnchor.deleteMany({
      where: { entityId: { startsWith: 'test-entity-' } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- submitAnchor ---

  describe('submitAnchor', () => {
    it('should submit a PENDING anchor and update to SUBMITTED', async () => {
      const result = await submitAnchor(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('SUBMITTED');
      expect(result.transactionHash).toBeTruthy();

      // Verify DB was updated
      const updated = await prisma.blockchainAnchor.findUnique({
        where: { id: anchorId },
      });
      expect(updated!.status).toBe('SUBMITTED');
      expect(updated!.transactionHash).toBeTruthy();
    });

    it('should throw if anchor is not PENDING', async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: { status: 'CONFIRMED' },
      });

      await expect(
        submitAnchor(prisma, anchorId, TEST_CONFIG)
      ).rejects.toThrow('not in PENDING status');
    });

    it('should throw if anchor not found', async () => {
      await expect(
        submitAnchor(prisma, 'nonexistent-id', TEST_CONFIG)
      ).rejects.toThrow('Anchor not found');
    });

    it('should mark FAILED on transaction error and store errorMessage', async () => {
      ethers.__mockSendTransaction.mockRejectedValueOnce(
        new Error('insufficient funds')
      );
      // Also mock Contract anchor to fail
      const mockContract = {
        anchor: jest.fn().mockRejectedValueOnce(
          new Error('insufficient funds')
        ),
      };
      ethers.Contract.mockImplementationOnce(() => mockContract);

      const result = await submitAnchor(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toContain('insufficient funds');
    });
  });

  // --- checkConfirmation ---

  describe('checkConfirmation', () => {
    beforeEach(async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: {
          status: 'SUBMITTED',
          transactionHash: '0xsubmitted123',
        },
      });
    });

    it('should confirm anchor when receipt exists', async () => {
      ethers.__mockGetTransactionReceipt.mockResolvedValueOnce({
        blockNumber: 12345,
        status: 1,
      });

      const result = await checkConfirmation(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('CONFIRMED');
      expect(result.blockNumber).toBe('12345');
      expect(result.anchoredAt).toBeTruthy();
    });

    it('should keep SUBMITTED when receipt is null', async () => {
      ethers.__mockGetTransactionReceipt.mockResolvedValueOnce(null);

      const result = await checkConfirmation(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('SUBMITTED');
    });

    it('should mark FAILED when receipt shows failure', async () => {
      ethers.__mockGetTransactionReceipt.mockResolvedValueOnce({
        blockNumber: 12345,
        status: 0,
      });

      const result = await checkConfirmation(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toContain('reverted');
    });

    it('should throw if anchor not found', async () => {
      await expect(
        checkConfirmation(prisma, 'nonexistent-id', TEST_CONFIG)
      ).rejects.toThrow('Anchor not found');
    });

    it('should throw if anchor is not SUBMITTED', async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: { status: 'PENDING' },
      });

      await expect(
        checkConfirmation(prisma, anchorId, TEST_CONFIG)
      ).rejects.toThrow('not in SUBMITTED status');
    });
  });

  // --- retryFailed ---

  describe('retryFailed', () => {
    beforeEach(async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: {
          status: 'FAILED',
          retryCount: 0,
          errorMessage: 'gas too low',
        },
      });
    });

    it('should re-submit FAILED anchor and increment retryCount', async () => {
      const result = await retryFailed(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('SUBMITTED');
      expect(result.retryCount).toBe(1);
      expect(result.transactionHash).toBeTruthy();
    });

    it('should permanently fail when retryCount reaches 3', async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: { retryCount: 3 },
      });

      const result = await retryFailed(prisma, anchorId, TEST_CONFIG);

      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toContain('max retries');
    });

    it('should throw if anchor not found', async () => {
      await expect(
        retryFailed(prisma, 'nonexistent-id', TEST_CONFIG)
      ).rejects.toThrow('Anchor not found');
    });

    it('should throw if anchor is not FAILED', async () => {
      await prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data: { status: 'PENDING' },
      });

      await expect(
        retryFailed(prisma, anchorId, TEST_CONFIG)
      ).rejects.toThrow('not in FAILED status');
    });
  });
});
