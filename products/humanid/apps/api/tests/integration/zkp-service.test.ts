/**
 * ZKP Verification Service Tests
 *
 * Tests for verifyProof, getVerificationKey, listCircuits,
 * validatePublicSignals, and isValidCircuitType.
 * Uses mocked snarkjs — no real proof verification.
 */

jest.mock('snarkjs', () => ({
  groth16: {
    verify: jest.fn(),
  },
}));

const snarkjs = require('snarkjs');

import {
  verifyProof,
  getVerificationKey,
  listCircuits,
  validatePublicSignals,
  isValidCircuitType,
} from '../../src/services/zkp.service';

describe('ZKP Verification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- verifyProof ---

  describe('verifyProof', () => {
    const validProof = {
      pi_a: ['1', '2', '1'],
      pi_b: [['3', '4'], ['5', '6'], ['1', '0']],
      pi_c: ['7', '8', '1'],
      protocol: 'groth16',
      curve: 'bn128',
    };

    it('should return verified=true for a valid proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const result = await verifyProof('age_range', validProof, ['1']);

      expect(result.verified).toBe(true);
      expect(result.circuitType).toBe('age_range');
      expect(result.publicSignals).toEqual(['1']);
      expect(result.verifiedAt).toBeDefined();
      expect(snarkjs.groth16.verify).toHaveBeenCalledTimes(1);
    });

    it('should return verified=false for an invalid proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(false);

      const result = await verifyProof('age_range', validProof, ['0']);

      expect(result.verified).toBe(false);
      expect(result.circuitType).toBe('age_range');
    });

    it('should reject tampered public signals (wrong count)', async () => {
      await expect(
        verifyProof('age_range', validProof, ['1', '2', '3'])
      ).rejects.toThrow();
    });

    it('should reject unknown circuit type', async () => {
      await expect(
        verifyProof('unknown_circuit' as any, validProof, ['1'])
      ).rejects.toThrow();
    });
  });

  // --- getVerificationKey ---

  describe('getVerificationKey', () => {
    it('should load verification key for known circuit', async () => {
      const vkey = await getVerificationKey('age_range');

      expect(vkey).toBeDefined();
      expect(vkey.protocol).toBe('groth16');
      expect(vkey.curve).toBe('bn128');
      expect(vkey.nPublic).toBe(1);
      expect(vkey.IC).toBeInstanceOf(Array);
    });

    it('should throw for unknown circuit type', async () => {
      await expect(
        getVerificationKey('nonexistent' as any)
      ).rejects.toThrow();
    });
  });

  // --- listCircuits ---

  describe('listCircuits', () => {
    it('should return metadata for all 4 circuits', () => {
      const circuits = listCircuits();

      expect(circuits).toHaveLength(4);
      const types = circuits.map((c) => c.type);
      expect(types).toContain('age_range');
      expect(types).toContain('membership');
      expect(types).toContain('equality');
      expect(types).toContain('range');

      for (const circuit of circuits) {
        expect(circuit).toHaveProperty('description');
        expect(circuit).toHaveProperty('publicSignalNames');
        expect(circuit).toHaveProperty('inputDescription');
        expect(circuit.publicSignalNames.length).toBeGreaterThan(0);
      }
    });
  });

  // --- validatePublicSignals ---

  describe('validatePublicSignals', () => {
    it('should accept correct signal count', () => {
      expect(() => validatePublicSignals('age_range', ['1'])).not.toThrow();
    });

    it('should reject wrong signal count', () => {
      expect(() =>
        validatePublicSignals('age_range', ['1', '2'])
      ).toThrow();
    });
  });

  // --- isValidCircuitType ---

  describe('isValidCircuitType', () => {
    it('should return true for valid circuit types', () => {
      expect(isValidCircuitType('age_range')).toBe(true);
      expect(isValidCircuitType('membership')).toBe(true);
      expect(isValidCircuitType('equality')).toBe(true);
      expect(isValidCircuitType('range')).toBe(true);
    });

    it('should return false for invalid circuit types', () => {
      expect(isValidCircuitType('invalid')).toBe(false);
      expect(isValidCircuitType('')).toBe(false);
    });
  });
});
