/**
 * ZKP Verification Service
 *
 * Server-side Groth16 zero-knowledge proof verification with:
 * - In-memory proof cache (content-addressable)
 * - Verification timing metrics
 * - Batch verification
 * - Enhanced circuit metadata with optimization hints
 *
 * Supports 4 circuit types: age_range, membership, equality, range.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as snarkjs from 'snarkjs';

// ==================== Circuit Configuration ====================

const CIRCUIT_TYPES = ['age_range', 'membership', 'equality', 'range'] as const;
export type CircuitType = typeof CIRCUIT_TYPES[number];

interface CircuitMetadata {
  type: CircuitType;
  description: string;
  publicSignalNames: string[];
  inputDescription: string;
  expectedSignalCount: number;
  constraints: number;
  proofSizeBytes: number;
  estimatedProvingTimeMs: number;
}

const CIRCUIT_METADATA: Record<CircuitType, CircuitMetadata> = {
  age_range: {
    type: 'age_range',
    description: 'Prove age above threshold without revealing date of birth',
    publicSignalNames: ['ageOverThreshold'],
    inputDescription: 'Private: dateOfBirth, threshold. Public: ageOverThreshold (0 or 1)',
    expectedSignalCount: 1,
    constraints: 1024,
    proofSizeBytes: 128,
    estimatedProvingTimeMs: 2500,
  },
  membership: {
    type: 'membership',
    description: 'Prove set membership without revealing which member',
    publicSignalNames: ['isMember'],
    inputDescription: 'Private: memberValue, membershipSet[]. Public: isMember (0 or 1)',
    expectedSignalCount: 1,
    constraints: 4096,
    proofSizeBytes: 128,
    estimatedProvingTimeMs: 4000,
  },
  equality: {
    type: 'equality',
    description: 'Prove attribute matches hash without revealing value',
    publicSignalNames: ['matches'],
    inputDescription: 'Private: attributeValue. Public: matches (0 or 1)',
    expectedSignalCount: 1,
    constraints: 512,
    proofSizeBytes: 128,
    estimatedProvingTimeMs: 1800,
  },
  range: {
    type: 'range',
    description: 'Prove value in range without revealing exact value',
    publicSignalNames: ['inRange'],
    inputDescription: 'Private: value, min, max. Public: inRange (0 or 1)',
    expectedSignalCount: 1,
    constraints: 2048,
    proofSizeBytes: 128,
    estimatedProvingTimeMs: 3000,
  },
};

// ==================== Caches ====================

const vkeyCache = new Map<CircuitType, Record<string, unknown>>();

const PROOF_CACHE_MAX = 1000;
const PROOF_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const proofCache = new Map<string, { result: VerifyResult; expiresAt: number }>();

function proofCacheKey(
  circuitType: string,
  proof: Record<string, unknown>,
  publicSignals: string[]
): string {
  const raw = JSON.stringify({ circuitType, proof, publicSignals });
  return createHash('sha256').update(raw).digest('hex');
}

function evictExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of proofCache) {
    if (entry.expiresAt <= now) proofCache.delete(key);
  }
}

function getVkeyDir(): string {
  return resolve(__dirname, '..', 'zkp', 'verification-keys');
}

// ==================== Public API ====================

export interface VerifyResult {
  verified: boolean;
  circuitType: CircuitType;
  publicSignals: string[];
  verifiedAt: string;
  verificationTimeMs?: number;
  cached?: boolean;
}

/**
 * Verify a Groth16 zero-knowledge proof (with caching).
 */
export async function verifyProof(
  circuitType: CircuitType,
  proof: Record<string, unknown>,
  publicSignals: string[]
): Promise<VerifyResult> {
  if (!isValidCircuitType(circuitType)) {
    throw new AppError(400, 'invalid-circuit', `Unknown circuit type: ${circuitType}`);
  }

  validatePublicSignals(circuitType, publicSignals);

  // Check proof cache
  const cacheKey = proofCacheKey(circuitType, proof, publicSignals);
  const cached = proofCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info('ZKP proof cache hit', { circuitType, cacheKey: cacheKey.slice(0, 8) });
    return { ...cached.result, cached: true, verificationTimeMs: 0 };
  }

  const vkey = await getVerificationKey(circuitType);

  logger.info('Verifying ZKP proof', { circuitType, signalCount: publicSignals.length });

  const startMs = performance.now();
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verificationTimeMs = Math.round((performance.now() - startMs) * 100) / 100;

  const result: VerifyResult = {
    verified: !!verified,
    circuitType,
    publicSignals,
    verifiedAt: new Date().toISOString(),
    verificationTimeMs,
  };

  // Cache the result
  evictExpiredCache();
  if (proofCache.size >= PROOF_CACHE_MAX) {
    const oldest = proofCache.keys().next().value;
    if (oldest) proofCache.delete(oldest);
  }
  proofCache.set(cacheKey, { result, expiresAt: Date.now() + PROOF_CACHE_TTL_MS });

  return result;
}

/**
 * Verify multiple proofs in a single batch.
 */
export async function verifyProofBatch(
  proofs: Array<{
    circuitType: CircuitType;
    proof: Record<string, unknown>;
    publicSignals: string[];
  }>
): Promise<{ results: VerifyResult[]; totalTimeMs: number }> {
  const startMs = performance.now();

  const results = await Promise.all(
    proofs.map((p) => verifyProof(p.circuitType, p.proof, p.publicSignals))
  );

  const totalTimeMs = Math.round((performance.now() - startMs) * 100) / 100;

  return { results, totalTimeMs };
}

/**
 * Load a verification key for a circuit type (cached).
 */
export async function getVerificationKey(
  circuitType: CircuitType
): Promise<Record<string, unknown>> {
  if (!isValidCircuitType(circuitType)) {
    throw new AppError(400, 'invalid-circuit', `Unknown circuit type: ${circuitType}`);
  }

  const cached = vkeyCache.get(circuitType);
  if (cached) return cached;

  const vkeyDir = getVkeyDir();
  const vkeyPath = resolve(vkeyDir, `${circuitType}.vkey.json`);

  try {
    const raw = readFileSync(vkeyPath, 'utf8');
    const vkey = JSON.parse(raw);
    vkeyCache.set(circuitType, vkey);
    return vkey;
  } catch (err) {
    throw new AppError(
      404,
      'vkey-not-found',
      `Verification key not found for circuit: ${circuitType}`
    );
  }
}

/**
 * List all available circuits with enhanced metadata.
 */
export function listCircuits(): CircuitMetadata[] {
  return CIRCUIT_TYPES.map((type) => CIRCUIT_METADATA[type]);
}

/**
 * Validate that public signals match the expected count for a circuit.
 */
export function validatePublicSignals(
  circuitType: CircuitType,
  signals: string[]
): void {
  const meta = CIRCUIT_METADATA[circuitType as CircuitType];
  if (!meta) {
    throw new AppError(400, 'invalid-circuit', `Unknown circuit type: ${circuitType}`);
  }

  if (signals.length !== meta.expectedSignalCount) {
    throw new AppError(
      400,
      'invalid-signals',
      `Circuit ${circuitType} expects ${meta.expectedSignalCount} public signal(s), got ${signals.length}`
    );
  }
}

/**
 * Type guard: check if a string is a valid circuit type.
 */
export function isValidCircuitType(type: string): type is CircuitType {
  return CIRCUIT_TYPES.includes(type as CircuitType);
}

/**
 * Clear the proof cache (for testing).
 */
export function clearProofCache(): void {
  proofCache.clear();
}
