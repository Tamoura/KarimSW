/**
 * Anchor Processor
 *
 * Background processor that runs on a setInterval cycle:
 * 1. Submits PENDING anchors (up to 10 per cycle)
 * 2. Polls SUBMITTED anchors for confirmation
 * 3. Retries FAILED anchors (retryCount < 3)
 */

import { PrismaClient } from '@prisma/client';
import {
  submitAnchor,
  checkConfirmation,
  retryFailed,
  AnchoringConfig,
} from './anchoring.service.js';
import { logger } from '../utils/logger.js';

interface ProcessorOptions {
  intervalMs?: number;
  batchSize?: number;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 10;

/**
 * Run a single processing cycle: submit, confirm, retry.
 */
export async function processAnchorsOnce(
  prisma: PrismaClient,
  config: AnchoringConfig,
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  // Step 1: Submit PENDING anchors (oldest first, limited batch)
  const pendingAnchors = await prisma.blockchainAnchor.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  for (const anchor of pendingAnchors) {
    try {
      await submitAnchor(prisma, anchor.id, config);
    } catch (error) {
      logger.error('Failed to submit anchor', error as Error, {
        anchorId: anchor.id,
      });
    }
  }

  // Step 2: Poll SUBMITTED anchors for confirmation
  const submittedAnchors = await prisma.blockchainAnchor.findMany({
    where: { status: 'SUBMITTED' },
    orderBy: { createdAt: 'asc' },
  });

  for (const anchor of submittedAnchors) {
    try {
      await checkConfirmation(prisma, anchor.id, config);
    } catch (error) {
      logger.error('Failed to check confirmation', error as Error, {
        anchorId: anchor.id,
      });
    }
  }

  // Step 3: Retry FAILED anchors where retryCount < 3
  const failedAnchors = await prisma.blockchainAnchor.findMany({
    where: {
      status: 'FAILED',
      retryCount: { lt: 3 },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const anchor of failedAnchors) {
    try {
      await retryFailed(prisma, anchor.id, config);
    } catch (error) {
      logger.error('Failed to retry anchor', error as Error, {
        anchorId: anchor.id,
      });
    }
  }
}

/**
 * Start the background anchor processor.
 * Returns a cleanup function that stops the interval.
 */
export function startAnchorProcessor(
  prisma: PrismaClient,
  config: AnchoringConfig,
  options?: ProcessorOptions
): () => void {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  logger.info('Starting anchor processor', {
    intervalMs: intervalMs as unknown as string,
    batchSize: batchSize as unknown as string,
  });

  const interval = setInterval(() => {
    processAnchorsOnce(prisma, config, batchSize).catch((error) => {
      logger.error('Anchor processor cycle failed', error as Error);
    });
  }, intervalMs);

  return () => {
    logger.info('Stopping anchor processor');
    clearInterval(interval);
  };
}
