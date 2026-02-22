/**
 * DID Cryptography Utilities
 *
 * Real Ed25519 key generation, signing, and verification using @noble/ed25519.
 * Implements:
 * - Ed25519 key pair generation
 * - did:humanid identifier creation (multibase base58btc encoding)
 * - W3C DID Document generation (DID Core 1.0 compliant)
 * - Ed25519Signature2020 signing and verification
 * - Key rotation support
 */

import * as ed from '@noble/ed25519';
import { createHash as nodeCreateHash } from 'crypto';

// Configure ed25519 v2 to use Node's built-in sha512
// In @noble/ed25519 v2, the sync hash goes in ed.hashes.sha512
(ed as unknown as { hashes: Record<string, unknown> }).hashes.sha512 = (...m: Uint8Array[]) => {
  const hash = nodeCreateHash('sha512');
  for (const a of m) {
    hash.update(a);
  }
  return new Uint8Array(hash.digest());
};

// Base58btc alphabet (Bitcoin)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode bytes to base58btc.
 */
export function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join('');
}

/**
 * Decode base58btc string to bytes.
 */
export function base58Decode(str: string): Uint8Array {
  const digits = [0];
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 58;
      digits[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const char of str) {
    if (char !== '1') break;
    digits.push(0);
  }
  return new Uint8Array(digits.reverse());
}

/**
 * Multibase encode with 'z' prefix (base58btc).
 */
export function multibaseEncode(bytes: Uint8Array): string {
  return `z${base58Encode(bytes)}`;
}

/**
 * Multibase decode (strips 'z' prefix).
 */
export function multibaseDecode(encoded: string): Uint8Array {
  if (!encoded.startsWith('z')) {
    throw new Error('Only base58btc multibase (z prefix) is supported');
  }
  return base58Decode(encoded.slice(1));
}

// ==================== Key Management ====================

export interface Ed25519KeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array;  // 32 bytes
}

/**
 * Generate a new Ed25519 key pair.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Derive the public key from a private key.
 */
export function getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey);
}

// ==================== DID Operations ====================

/**
 * Build a did:humanid identifier from an Ed25519 public key.
 * Format: did:humanid:<base58btc(publicKey)>
 */
export function buildDidFromPublicKey(publicKey: Uint8Array): string {
  return `did:humanid:${base58Encode(publicKey)}`;
}

/**
 * Extract the public key from a did:humanid identifier.
 */
export function extractPublicKeyFromDid(did: string): Uint8Array {
  const parts = did.split(':');
  if (parts.length !== 3 || parts[0] !== 'did' || parts[1] !== 'humanid') {
    throw new Error(`Invalid did:humanid format: ${did}`);
  }
  return base58Decode(parts[2]);
}

export interface VerificationMethodEntry {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
  revoked?: boolean;
}

export interface ServiceEntry {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface BuildDidDocumentOptions {
  verificationMethods?: VerificationMethodEntry[];
  services?: ServiceEntry[];
  activeKeyId?: string;
}

/**
 * Build a W3C DID Core 1.0 compliant DID Document.
 *
 * Supports multiple verification methods (for key rotation) and services.
 * When options are provided, they override the default single-key document.
 */
export function buildDidDocument(
  did: string,
  publicKey: Uint8Array,
  options?: BuildDidDocumentOptions
) {
  const defaultKeyId = `${did}#key-1`;

  if (options?.verificationMethods) {
    const activeId = options.activeKeyId || defaultKeyId;
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: options.verificationMethods,
      authentication: [activeId],
      assertionMethod: [activeId],
      keyAgreement: [],
      service: options.services || [],
    };
  }

  const publicKeyMultibase = multibaseEncode(publicKey);

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: defaultKeyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [defaultKeyId],
    assertionMethod: [defaultKeyId],
    keyAgreement: [],
    service: [],
  };
}

// ==================== Signing & Verification ====================

/**
 * Sign a message with an Ed25519 private key.
 * Returns the signature as bytes.
 */
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

/**
 * Verify an Ed25519 signature.
 */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Build an Ed25519Signature2020 proof object for a verifiable credential.
 */
export function buildEd25519Proof(
  issuerDid: string,
  credentialData: string,
  privateKey: Uint8Array
) {
  const message = new TextEncoder().encode(credentialData);
  const signature = sign(message, privateKey);

  return {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: `${issuerDid}#key-1`,
    proofPurpose: 'assertionMethod',
    proofValue: Buffer.from(signature).toString('base64'),
  };
}

/**
 * Verify an Ed25519Signature2020 proof.
 */
export function verifyEd25519Proof(
  proof: { proofValue: string; verificationMethod: string },
  credentialData: string,
  publicKey: Uint8Array
): boolean {
  const message = new TextEncoder().encode(credentialData);
  const signature = Buffer.from(proof.proofValue, 'base64');
  return verify(new Uint8Array(signature), message, publicKey);
}

/**
 * Serialize key pair for storage.
 * Private key stored as hex, public key as base58.
 */
export function serializeKeyPair(keyPair: Ed25519KeyPair) {
  return {
    privateKeyHex: Buffer.from(keyPair.privateKey).toString('hex'),
    publicKeyBase58: base58Encode(keyPair.publicKey),
  };
}

/**
 * Deserialize key pair from storage.
 */
export function deserializePrivateKey(privateKeyHex: string): Uint8Array {
  if (privateKeyHex.length !== 64) {
    throw new Error('Invalid private key: expected 64 hex characters (32 bytes for Ed25519)');
  }
  return new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
}
