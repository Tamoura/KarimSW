/**
 * Anchoring Service
 *
 * Submits blockchain anchors to Polygon via ethers.js v6.
 * Handles the PENDING → SUBMITTED → CONFIRMED lifecycle.
 */

import { PrismaClient, BlockchainAnchor } from '@prisma/client';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { logger } from '../utils/logger.js';

export interface AnchoringConfig {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
}

/** Minimal ABI for HumanIDAnchor contract: anchor(bytes32) */
const ANCHOR_ABI = [
  'function anchor(bytes32 hash) external',
  'event Anchored(bytes32 indexed hash, uint256 timestamp)',
];

/**
 * Submit a PENDING anchor to the blockchain.
 * Transitions: PENDING → SUBMITTED (success) or PENDING → FAILED (error).
 */
export async function submitAnchor(
  prisma: PrismaClient,
  anchorId: string,
  config: AnchoringConfig
): Promise<BlockchainAnchor> {
  const anchor = await prisma.blockchainAnchor.findUnique({
    where: { id: anchorId },
  });

  if (!anchor) {
    throw new Error('Anchor not found');
  }

  if (anchor.status !== 'PENDING') {
    throw new Error(`Anchor ${anchorId} not in PENDING status`);
  }

  try {
    const provider = new JsonRpcProvider(config.rpcUrl);
    const wallet = new Wallet(config.privateKey);
    const signer = wallet.connect(provider);
    const contract = new Contract(config.contractAddress, ANCHOR_ABI, signer);

    const tx = await contract.anchor('0x' + anchor.dataHash);

    return await prisma.blockchainAnchor.update({
      where: { id: anchorId },
      data: {
        status: 'SUBMITTED',
        transactionHash: tx.hash,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Anchor submission failed', error as Error, {
      anchorId,
    });

    return await prisma.blockchainAnchor.update({
      where: { id: anchorId },
      data: {
        status: 'FAILED',
        errorMessage: message,
      },
    });
  }
}

/**
 * Check if a SUBMITTED anchor has been confirmed on-chain.
 * Transitions: SUBMITTED → CONFIRMED or SUBMITTED → FAILED (reverted).
 */
export async function checkConfirmation(
  prisma: PrismaClient,
  anchorId: string,
  config: AnchoringConfig
): Promise<BlockchainAnchor> {
  const anchor = await prisma.blockchainAnchor.findUnique({
    where: { id: anchorId },
  });

  if (!anchor) {
    throw new Error('Anchor not found');
  }

  if (anchor.status !== 'SUBMITTED') {
    throw new Error(`Anchor ${anchorId} not in SUBMITTED status`);
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const receipt = await provider.getTransactionReceipt(anchor.transactionHash!);

  if (!receipt) {
    // Still pending on-chain
    return anchor;
  }

  if (receipt.status === 0) {
    return await prisma.blockchainAnchor.update({
      where: { id: anchorId },
      data: {
        status: 'FAILED',
        errorMessage: 'Transaction reverted on-chain',
        blockNumber: String(receipt.blockNumber),
      },
    });
  }

  return await prisma.blockchainAnchor.update({
    where: { id: anchorId },
    data: {
      status: 'CONFIRMED',
      blockNumber: String(receipt.blockNumber),
      anchoredAt: new Date(),
    },
  });
}

/**
 * Retry a FAILED anchor with gas bump.
 * If retryCount >= 3, marks as permanently failed.
 */
export async function retryFailed(
  prisma: PrismaClient,
  anchorId: string,
  config: AnchoringConfig
): Promise<BlockchainAnchor> {
  const anchor = await prisma.blockchainAnchor.findUnique({
    where: { id: anchorId },
  });

  if (!anchor) {
    throw new Error('Anchor not found');
  }

  if (anchor.status !== 'FAILED') {
    throw new Error(`Anchor ${anchorId} not in FAILED status`);
  }

  if (anchor.retryCount >= 3) {
    return await prisma.blockchainAnchor.update({
      where: { id: anchorId },
      data: {
        errorMessage: `Permanently failed after max retries (${anchor.retryCount})`,
      },
    });
  }

  // Reset to PENDING, increment retryCount, then submit
  await prisma.blockchainAnchor.update({
    where: { id: anchorId },
    data: {
      status: 'PENDING',
      retryCount: anchor.retryCount + 1,
      errorMessage: null,
      transactionHash: null,
    },
  });

  return await submitAnchor(prisma, anchorId, config);
}
