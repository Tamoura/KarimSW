/**
 * DID Crypto Unit Tests
 *
 * Tests Ed25519 key generation, signing, verification,
 * DID construction, and DID document generation.
 */

import {
  generateEd25519KeyPair,
  getPublicKeyFromPrivate,
  buildDidFromPublicKey,
  extractPublicKeyFromDid,
  buildDidDocument,
  sign,
  verify,
  buildEd25519Proof,
  verifyEd25519Proof,
  base58Encode,
  base58Decode,
  multibaseEncode,
  multibaseDecode,
  serializeKeyPair,
  deserializePrivateKey,
} from '../../src/utils/did-crypto';

describe('DID Crypto', () => {
  describe('Ed25519 Key Generation', () => {
    it('should generate a 32-byte private key and 32-byte public key', () => {
      const keyPair = generateEd25519KeyPair();
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    it('should generate unique key pairs each time', () => {
      const kp1 = generateEd25519KeyPair();
      const kp2 = generateEd25519KeyPair();
      expect(Buffer.from(kp1.privateKey).toString('hex'))
        .not.toBe(Buffer.from(kp2.privateKey).toString('hex'));
      expect(Buffer.from(kp1.publicKey).toString('hex'))
        .not.toBe(Buffer.from(kp2.publicKey).toString('hex'));
    });

    it('should derive correct public key from private key', () => {
      const keyPair = generateEd25519KeyPair();
      const derivedPubKey = getPublicKeyFromPrivate(keyPair.privateKey);
      expect(Buffer.from(derivedPubKey).toString('hex'))
        .toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    });
  });

  describe('Base58 Encoding', () => {
    it('should roundtrip encode/decode', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const encoded = base58Encode(original);
      const decoded = base58Decode(encoded);
      expect(Buffer.from(decoded).toString('hex'))
        .toBe(Buffer.from(original).toString('hex'));
    });

    it('should handle 32-byte keys', () => {
      const keyPair = generateEd25519KeyPair();
      const encoded = base58Encode(keyPair.publicKey);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
      const decoded = base58Decode(encoded);
      expect(Buffer.from(decoded).toString('hex'))
        .toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    });
  });

  describe('Multibase Encoding', () => {
    it('should add z prefix for base58btc', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const encoded = multibaseEncode(bytes);
      expect(encoded).toMatch(/^z/);
    });

    it('should roundtrip', () => {
      const keyPair = generateEd25519KeyPair();
      const encoded = multibaseEncode(keyPair.publicKey);
      const decoded = multibaseDecode(encoded);
      expect(Buffer.from(decoded).toString('hex'))
        .toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    });

    it('should reject non-z prefix', () => {
      expect(() => multibaseDecode('m123')).toThrow();
    });
  });

  describe('DID Construction', () => {
    it('should create did:humanid:<base58(pubkey)> format', () => {
      const keyPair = generateEd25519KeyPair();
      const did = buildDidFromPublicKey(keyPair.publicKey);
      expect(did).toMatch(/^did:humanid:[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    });

    it('should extract public key from DID', () => {
      const keyPair = generateEd25519KeyPair();
      const did = buildDidFromPublicKey(keyPair.publicKey);
      const extracted = extractPublicKeyFromDid(did);
      expect(Buffer.from(extracted).toString('hex'))
        .toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    });

    it('should reject invalid DID format', () => {
      expect(() => extractPublicKeyFromDid('invalid')).toThrow();
      expect(() => extractPublicKeyFromDid('did:other:abc')).toThrow();
    });
  });

  describe('DID Document', () => {
    it('should generate W3C DID Core 1.0 compliant document', () => {
      const keyPair = generateEd25519KeyPair();
      const did = buildDidFromPublicKey(keyPair.publicKey);
      const doc = buildDidDocument(did, keyPair.publicKey);

      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(doc.id).toBe(did);
      expect(doc.verificationMethod).toHaveLength(1);
      expect(doc.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
      expect(doc.verificationMethod[0].controller).toBe(did);
      expect(doc.verificationMethod[0].publicKeyMultibase).toMatch(/^z/);
      expect(doc.authentication).toContain(`${did}#key-1`);
      expect(doc.assertionMethod).toContain(`${did}#key-1`);
    });
  });

  describe('Signing & Verification', () => {
    it('should sign and verify a message', () => {
      const keyPair = generateEd25519KeyPair();
      const message = new TextEncoder().encode('Hello, HumanID!');
      const signature = sign(message, keyPair.privateKey);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      const isValid = verify(signature, message, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject tampered message', () => {
      const keyPair = generateEd25519KeyPair();
      const message = new TextEncoder().encode('Original message');
      const signature = sign(message, keyPair.privateKey);

      const tampered = new TextEncoder().encode('Tampered message');
      const isValid = verify(signature, tampered, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should reject wrong public key', () => {
      const keyPair1 = generateEd25519KeyPair();
      const keyPair2 = generateEd25519KeyPair();
      const message = new TextEncoder().encode('Test');
      const signature = sign(message, keyPair1.privateKey);

      const isValid = verify(signature, message, keyPair2.publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Ed25519Signature2020 Proof', () => {
    it('should build and verify a credential proof', () => {
      const keyPair = generateEd25519KeyPair();
      const did = buildDidFromPublicKey(keyPair.publicKey);
      const credentialData = JSON.stringify({
        type: 'UniversityDegree',
        claims: { degree: 'BSc', university: 'MIT' },
      });

      const proof = buildEd25519Proof(did, credentialData, keyPair.privateKey);

      expect(proof.type).toBe('Ed25519Signature2020');
      expect(proof.verificationMethod).toBe(`${did}#key-1`);
      expect(proof.proofPurpose).toBe('assertionMethod');
      expect(typeof proof.proofValue).toBe('string');
      expect(typeof proof.created).toBe('string');

      const isValid = verifyEd25519Proof(proof, credentialData, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject proof with wrong data', () => {
      const keyPair = generateEd25519KeyPair();
      const did = buildDidFromPublicKey(keyPair.publicKey);

      const proof = buildEd25519Proof(did, 'original data', keyPair.privateKey);
      const isValid = verifyEd25519Proof(proof, 'different data', keyPair.publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Key Serialization', () => {
    it('should serialize and deserialize key pair', () => {
      const keyPair = generateEd25519KeyPair();
      const serialized = serializeKeyPair(keyPair);

      expect(typeof serialized.privateKeyHex).toBe('string');
      expect(serialized.privateKeyHex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(typeof serialized.publicKeyBase58).toBe('string');

      const deserialized = deserializePrivateKey(serialized.privateKeyHex);
      expect(Buffer.from(deserialized).toString('hex'))
        .toBe(Buffer.from(keyPair.privateKey).toString('hex'));
    });
  });
});
