/**
 * ZKP Verification Service
 *
 * Server-side Groth16 zero-knowledge proof verification.
 * Supports 4 circuit types: age_range, membership, equality, range.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

// snarkjs is imported dynamically to support both ESM and CJS environments
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
}

const CIRCUIT_METADATA: Record<CircuitType, CircuitMetadata> = {
  age_range: {
    type: 'age_range',
    description: 'Prove age above threshold without revealing date of birth',
    publicSignalNames: ['ageOverThreshold'],
    inputDescription: 'Private: dateOfBirth, threshold. Public: ageOverThreshold (0 or 1)',
    expectedSignalCount: 1,
  },
  membership: {
    type: 'membership',
    description: 'Prove set membership without revealing which member',
    publicSignalNames: ['isMember'],
    inputDescription: 'Private: memberValue, membershipSet[]. Public: isMember (0 or 1)',
    expectedSignalCount: 1,
  },
  equality: {
    type: 'equality',
    description: 'Prove attribute matches hash without revealing value',
    publicSignalNames: ['matches'],
    inputDescription: 'Private: attributeValue. Public: matches (0 or 1)',
    expectedSignalCount: 1,
  },
  range: {
    type: 'range',
    description: 'Prove value in range without revealing exact value',
    publicSignalNames: ['inRange'],
    inputDescription: 'Private: value, min, max. Public: inRange (0 or 1)',
    expectedSignalCount: 1,
  },
};

// ==================== Verification Key Cache ====================

const vkeyCache = new Map<CircuitType, Record<string, unknown>>();

function getVkeyDir(): string {
  // ts-jest runs in CJS, tsx/Node ESM sets __dirname via tsconfig.
  // Resolve relative to this file's compiled location (src/services/).
  return resolve(__dirname, '..', 'zkp', 'verification-keys');
}

// ==================== Public API ====================

export interface VerifyResult {
  verified: boolean;
  circuitType: CircuitType;
  publicSignals: string[];
  verifiedAt: string;
}

/**
 * Verify a Groth16 zero-knowledge proof.
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

  const vkey = await getVerificationKey(circuitType);

  logger.info('Verifying ZKP proof', { circuitType, signalCount: publicSignals.length });

  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  return {
    verified: !!verified,
    circuitType,
    publicSignals,
    verifiedAt: new Date().toISOString(),
  };
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
 * List all available circuits with metadata.
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
