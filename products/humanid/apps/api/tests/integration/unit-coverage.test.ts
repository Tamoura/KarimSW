/**
 * Unit Coverage Tests
 *
 * Pure unit tests covering uncovered branches in:
 *   - src/types/index.ts     (AppError subclasses, toJSON format)
 *   - src/utils/crypto.ts    (hashApiKey branches, generateApiKey, getApiKeyPrefix, hashDocument)
 *   - src/utils/encryption.ts (getEncryptionKey, encrypt/decrypt, claims, privateKey, deriveHmacKey, timingSafeCompare)
 *
 * No buildApp(), no Prisma, no HTTP server.
 */

import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  ValidationError,
} from '../../src/types/index';

import {
  hashApiKey,
  generateApiKey,
  getApiKeyPrefix,
  hashDocument,
} from '../../src/utils/crypto';

import {
  getEncryptionKey,
  encrypt,
  decrypt,
  encryptClaims,
  decryptClaims,
  encryptPrivateKey,
  decryptPrivateKey,
  deriveHmacKey,
  timingSafeCompare,
} from '../../src/utils/encryption';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid 32-byte AES-256 key as a 64-char hex string. */
const TEST_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// ---------------------------------------------------------------------------
// src/types/index.ts — AppError and subclasses
// ---------------------------------------------------------------------------

describe('AppError and subclasses', () => {
  // ---- AppError base -------------------------------------------------------

  describe('AppError', () => {
    it('stores statusCode, code, message, and optional details', () => {
      const err = new AppError(500, 'internal', 'Something exploded', { hint: 'retry' });
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('internal');
      expect(err.message).toBe('Something exploded');
      expect(err.details).toEqual({ hint: 'retry' });
      expect(err.name).toBe('AppError');
    });

    it('is an instance of Error', () => {
      const err = new AppError(500, 'internal', 'boom');
      expect(err).toBeInstanceOf(Error);
    });

    describe('toJSON()', () => {
      it('returns RFC 7807 shape with correct type URL', () => {
        const err = new AppError(400, 'bad-request', 'Something was wrong');
        const json = err.toJSON();
        expect(json.type).toBe('https://humanid.dev/errors/bad-request');
        expect(json.status).toBe(400);
        expect(json.detail).toBe('Something was wrong');
      });

      it('capitalises each hyphen-separated word in the title', () => {
        const err = new AppError(422, 'validation-error', 'Oops');
        const json = err.toJSON();
        expect(json.title).toBe('Validation Error');
      });

      it('title is a single capitalised word for single-word codes', () => {
        const err = new AppError(409, 'conflict', 'Already exists');
        expect(err.toJSON().title).toBe('Conflict');
      });

      it('title handles three-word codes', () => {
        const err = new AppError(403, 'access-denied-permanently', 'Nope');
        expect(err.toJSON().title).toBe('Access Denied Permanently');
      });
    });
  });

  // ---- NotFoundError -------------------------------------------------------

  describe('NotFoundError', () => {
    it('uses default message when none is provided', () => {
      const err = new NotFoundError();
      expect(err.message).toBe('Resource not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('not-found');
      expect(err.name).toBe('NotFoundError');
    });

    it('accepts a custom message', () => {
      const err = new NotFoundError('User not found');
      expect(err.message).toBe('User not found');
    });

    it('is an instance of AppError and Error', () => {
      const err = new NotFoundError();
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('toJSON uses not-found code', () => {
      const json = new NotFoundError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/not-found');
      expect(json.status).toBe(404);
    });
  });

  // ---- UnauthorizedError ---------------------------------------------------

  describe('UnauthorizedError', () => {
    it('uses default message when none is provided', () => {
      const err = new UnauthorizedError();
      expect(err.message).toBe('Authentication required');
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('unauthorized');
      expect(err.name).toBe('UnauthorizedError');
    });

    it('accepts a custom message', () => {
      const err = new UnauthorizedError('Token expired');
      expect(err.message).toBe('Token expired');
    });

    it('toJSON uses unauthorized code', () => {
      const json = new UnauthorizedError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/unauthorized');
      expect(json.status).toBe(401);
    });
  });

  // ---- ForbiddenError ------------------------------------------------------

  describe('ForbiddenError', () => {
    it('uses default message when none is provided', () => {
      const err = new ForbiddenError();
      expect(err.message).toBe('Access denied');
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('forbidden');
      expect(err.name).toBe('ForbiddenError');
    });

    it('accepts a custom message', () => {
      const err = new ForbiddenError('Insufficient permissions');
      expect(err.message).toBe('Insufficient permissions');
    });

    it('toJSON uses forbidden code', () => {
      const json = new ForbiddenError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/forbidden');
      expect(json.status).toBe(403);
    });
  });

  // ---- BadRequestError -----------------------------------------------------

  describe('BadRequestError', () => {
    it('uses default message when none is provided', () => {
      const err = new BadRequestError();
      expect(err.message).toBe('Bad request');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('bad-request');
      expect(err.name).toBe('BadRequestError');
    });

    it('accepts a custom message', () => {
      const err = new BadRequestError('Invalid email format');
      expect(err.message).toBe('Invalid email format');
    });

    it('accepts details as a second argument', () => {
      const details = [{ field: 'email', issue: 'required' }];
      const err = new BadRequestError('Validation failed', details);
      expect(err.details).toEqual(details);
    });

    it('has undefined details when not provided', () => {
      const err = new BadRequestError();
      expect(err.details).toBeUndefined();
    });

    it('toJSON uses bad-request code', () => {
      const json = new BadRequestError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/bad-request');
      expect(json.status).toBe(400);
    });
  });

  // ---- ConflictError -------------------------------------------------------

  describe('ConflictError', () => {
    it('uses default message when none is provided', () => {
      const err = new ConflictError();
      expect(err.message).toBe('Resource conflict');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('conflict');
      expect(err.name).toBe('ConflictError');
    });

    it('accepts a custom message', () => {
      const err = new ConflictError('Email already registered');
      expect(err.message).toBe('Email already registered');
    });

    it('toJSON uses conflict code', () => {
      const json = new ConflictError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/conflict');
      expect(json.status).toBe(409);
    });
  });

  // ---- ValidationError -----------------------------------------------------

  describe('ValidationError', () => {
    it('uses default message when none is provided', () => {
      const err = new ValidationError();
      expect(err.message).toBe('Validation failed');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('validation-error');
      expect(err.name).toBe('ValidationError');
    });

    it('accepts a custom message', () => {
      const err = new ValidationError('Schema mismatch');
      expect(err.message).toBe('Schema mismatch');
    });

    it('accepts details as a second argument', () => {
      const details = { fields: ['name', 'dob'] };
      const err = new ValidationError('Fields missing', details);
      expect(err.details).toEqual(details);
    });

    it('has undefined details when not provided', () => {
      const err = new ValidationError();
      expect(err.details).toBeUndefined();
    });

    it('toJSON uses validation-error code with title Validation Error', () => {
      const json = new ValidationError().toJSON();
      expect(json.type).toBe('https://humanid.dev/errors/validation-error');
      expect(json.status).toBe(422);
      expect(json.title).toBe('Validation Error');
    });
  });
});

// ---------------------------------------------------------------------------
// src/utils/crypto.ts
// ---------------------------------------------------------------------------

describe('crypto utils', () => {
  let savedHmacSecret: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedHmacSecret = process.env.API_KEY_HMAC_SECRET;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedHmacSecret === undefined) {
      delete process.env.API_KEY_HMAC_SECRET;
    } else {
      process.env.API_KEY_HMAC_SECRET = savedHmacSecret;
    }
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  // ---- hashApiKey ----------------------------------------------------------

  describe('hashApiKey()', () => {
    it('returns HMAC-SHA256 hex when API_KEY_HMAC_SECRET is set', () => {
      process.env.API_KEY_HMAC_SECRET = 'super-secret-hmac-key';
      delete process.env.NODE_ENV;

      const result = hashApiKey('humanid_sk_testapikey');
      // Must be a 64-char hex string (SHA-256 output)
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns a different hash per secret (HMAC differs from SHA-256)', () => {
      const testKey = 'humanid_sk_somekey';

      // HMAC path
      process.env.API_KEY_HMAC_SECRET = 'my-secret';
      const hmacHash = hashApiKey(testKey);

      // SHA-256 fallback path
      delete process.env.API_KEY_HMAC_SECRET;
      process.env.NODE_ENV = 'test';
      const sha256Hash = hashApiKey(testKey);

      expect(hmacHash).not.toBe(sha256Hash);
    });

    it('is deterministic for the same key and secret', () => {
      process.env.API_KEY_HMAC_SECRET = 'deterministic-secret';
      const first = hashApiKey('mykey');
      const second = hashApiKey('mykey');
      expect(first).toBe(second);
    });

    it('falls back to SHA-256 in non-production when no HMAC secret is set', () => {
      delete process.env.API_KEY_HMAC_SECRET;
      process.env.NODE_ENV = 'test';

      const result = hashApiKey('humanid_sk_fallback');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces the same SHA-256 fallback value as a direct hash', () => {
      delete process.env.API_KEY_HMAC_SECRET;
      process.env.NODE_ENV = 'development';

      const input = 'humanid_sk_knownvalue';
      const result = hashApiKey(input);

      // Verify manually with Node crypto
      const { createHash } = require('crypto');
      const expected = createHash('sha256').update(input).digest('hex');
      expect(result).toBe(expected);
    });

    it('throws in production when API_KEY_HMAC_SECRET is not set', () => {
      delete process.env.API_KEY_HMAC_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => hashApiKey('humanid_sk_prodkey')).toThrow(
        'API_KEY_HMAC_SECRET is required in production'
      );
    });
  });

  // ---- generateApiKey ------------------------------------------------------

  describe('generateApiKey()', () => {
    it('generates a key with the humanid_sk_ prefix by default', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^humanid_sk_[0-9a-f]{64}$/);
    });

    it('generates a key with the humanid_sk_ prefix when prefix="sk"', () => {
      const key = generateApiKey('sk');
      expect(key).toMatch(/^humanid_sk_[0-9a-f]{64}$/);
    });

    it('generates a key with the humanid_pk_ prefix when prefix="pk"', () => {
      const key = generateApiKey('pk');
      expect(key).toMatch(/^humanid_pk_[0-9a-f]{64}$/);
    });

    it('generates unique keys on each call', () => {
      const a = generateApiKey('sk');
      const b = generateApiKey('sk');
      expect(a).not.toBe(b);
    });
  });

  // ---- getApiKeyPrefix -----------------------------------------------------

  describe('getApiKeyPrefix()', () => {
    it('returns the first 16 characters followed by "..."', () => {
      const key = 'humanid_sk_abcde1234567890xyz';
      const prefix = getApiKeyPrefix(key);
      expect(prefix).toBe('humanid_sk_abcde...');
      expect(prefix).toHaveLength(19); // 16 chars + '...'
    });

    it('works for pk keys', () => {
      const key = 'humanid_pk_abcde1234567890xyz';
      expect(getApiKeyPrefix(key)).toBe('humanid_pk_abcde...');
    });

    it('returns 16 chars of content plus ellipsis for any input', () => {
      const key = 'a'.repeat(32);
      const result = getApiKeyPrefix(key);
      expect(result).toBe('a'.repeat(16) + '...');
    });
  });

  // ---- hashDocument --------------------------------------------------------

  describe('hashDocument()', () => {
    it('returns a 64-char hex SHA-256 hash', () => {
      const hash = hashDocument('{"type":"VerifiableCredential"}');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same input', () => {
      const content = 'deterministic content string';
      expect(hashDocument(content)).toBe(hashDocument(content));
    });

    it('produces different hashes for different inputs', () => {
      expect(hashDocument('content-a')).not.toBe(hashDocument('content-b'));
    });

    it('matches the known SHA-256 of an empty string', () => {
      // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(hashDocument('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });
  });
});

// ---------------------------------------------------------------------------
// src/utils/encryption.ts
// ---------------------------------------------------------------------------

describe('encryption utils', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.CLAIMS_ENCRYPTION_KEY;
    process.env.CLAIMS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.CLAIMS_ENCRYPTION_KEY;
    } else {
      process.env.CLAIMS_ENCRYPTION_KEY = savedKey;
    }
  });

  // ---- getEncryptionKey ----------------------------------------------------

  describe('getEncryptionKey()', () => {
    it('returns a Buffer when CLAIMS_ENCRYPTION_KEY is set', () => {
      const key = getEncryptionKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32); // 64 hex chars → 32 bytes
    });

    it('returns a Buffer whose hex encoding matches the env value', () => {
      const key = getEncryptionKey();
      expect(key.toString('hex')).toBe(TEST_ENCRYPTION_KEY);
    });

    it('throws when CLAIMS_ENCRYPTION_KEY is not set', () => {
      delete process.env.CLAIMS_ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow('CLAIMS_ENCRYPTION_KEY is required');
    });
  });

  // ---- encrypt / decrypt ---------------------------------------------------

  describe('encrypt() and decrypt()', () => {
    it('round-trips plaintext correctly', () => {
      const plaintext = 'hello world';
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces the iv:authTag:ciphertext format (two colons)', () => {
      const ciphertext = encrypt('test');
      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(3);
      // Each part is non-empty base64
      parts.forEach(part => expect(part.length).toBeGreaterThan(0));
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = encrypt('same input');
      const b = encrypt('same input');
      expect(a).not.toBe(b);
    });

    it('preserves unicode content through the round-trip', () => {
      const original = 'こんにちは — naïve café';
      expect(decrypt(encrypt(original))).toBe(original);
    });

    it('throws on a tampered auth tag', () => {
      const ciphertext = encrypt('sensitive data');
      const [iv, , data] = ciphertext.split(':');
      // Flip a byte in the auth tag by using a different base64 value
      const tampered = `${iv}:AAAAAAAAAAAAAAAAAAAAAA==:${data}`;
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  // ---- encryptClaims / decryptClaims ---------------------------------------

  describe('encryptClaims() and decryptClaims()', () => {
    it('round-trips a simple claims object', () => {
      const claims = { sub: 'user-123', email: 'alice@example.com', role: 'HOLDER' };
      const encrypted = encryptClaims(claims);
      expect(decryptClaims(encrypted)).toEqual(claims);
    });

    it('round-trips a nested claims object', () => {
      const claims = {
        sub: 'did:humanid:abc',
        vc: { type: ['VerifiableCredential'], issuer: 'did:humanid:issuer' },
        exp: 9999999999,
      };
      expect(decryptClaims(encryptClaims(claims))).toEqual(claims);
    });

    it('round-trips an empty claims object', () => {
      expect(decryptClaims(encryptClaims({}))).toEqual({});
    });

    it('returns a string (not the raw JSON)', () => {
      const result = encryptClaims({ foo: 'bar' });
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).toThrow(); // should NOT be plain JSON
    });
  });

  // ---- encryptPrivateKey / decryptPrivateKey --------------------------------

  describe('encryptPrivateKey() and decryptPrivateKey()', () => {
    it('round-trips a hex private key', () => {
      const privateKeyHex = 'deadbeef'.repeat(8); // 64 hex chars
      const encrypted = encryptPrivateKey(privateKeyHex);
      expect(decryptPrivateKey(encrypted)).toBe(privateKeyHex);
    });

    it('encrypted value is different from the original key', () => {
      const key = 'cafebabe'.repeat(8);
      expect(encryptPrivateKey(key)).not.toBe(key);
    });

    it('produces different ciphertexts on each call (random IV)', () => {
      const key = '00112233'.repeat(8);
      expect(encryptPrivateKey(key)).not.toBe(encryptPrivateKey(key));
    });
  });

  // ---- deriveHmacKey -------------------------------------------------------

  describe('deriveHmacKey()', () => {
    it('returns a 64-char hex string', () => {
      const derived = deriveHmacKey('offline-token', 'user-abc');
      expect(derived).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same inputs produce same output', () => {
      const a = deriveHmacKey('purpose', 'id-1');
      const b = deriveHmacKey('purpose', 'id-1');
      expect(a).toBe(b);
    });

    it('differs for different purposes with the same identifier', () => {
      const a = deriveHmacKey('purpose-alpha', 'same-id');
      const b = deriveHmacKey('purpose-beta', 'same-id');
      expect(a).not.toBe(b);
    });

    it('differs for different identifiers with the same purpose', () => {
      const a = deriveHmacKey('same-purpose', 'id-one');
      const b = deriveHmacKey('same-purpose', 'id-two');
      expect(a).not.toBe(b);
    });

    it('differs for all four combinations of two purposes × two identifiers', () => {
      const results = [
        deriveHmacKey('p1', 'i1'),
        deriveHmacKey('p1', 'i2'),
        deriveHmacKey('p2', 'i1'),
        deriveHmacKey('p2', 'i2'),
      ];
      const unique = new Set(results);
      expect(unique.size).toBe(4);
    });

    it('throws when CLAIMS_ENCRYPTION_KEY is not set', () => {
      delete process.env.CLAIMS_ENCRYPTION_KEY;
      expect(() => deriveHmacKey('purpose', 'id')).toThrow(
        'CLAIMS_ENCRYPTION_KEY is required'
      );
    });
  });

  // ---- timingSafeCompare ---------------------------------------------------

  describe('timingSafeCompare()', () => {
    it('returns true for two identical hex strings', () => {
      const hex = 'deadbeef'.repeat(8); // 64 chars
      expect(timingSafeCompare(hex, hex)).toBe(true);
    });

    it('returns true when comparing two separate but equal hex strings', () => {
      const a = 'aabbccdd'.repeat(8);
      const b = 'aabbccdd'.repeat(8);
      expect(timingSafeCompare(a, b)).toBe(true);
    });

    it('returns false for two different hex strings of the same length', () => {
      const a = '0'.repeat(64);
      const b = 'f'.repeat(64);
      expect(timingSafeCompare(a, b)).toBe(false);
    });

    it('returns false when strings differ by one character', () => {
      const a = 'deadbeef'.repeat(8);
      const b = 'deadbeee' + 'deadbeef'.repeat(7); // last nibble differs
      expect(timingSafeCompare(a, b)).toBe(false);
    });

    it('returns false when the strings have different lengths (short-circuit)', () => {
      expect(timingSafeCompare('aabb', 'aabbcc')).toBe(false);
    });

    it('returns false for empty vs non-empty string', () => {
      expect(timingSafeCompare('', 'aabb')).toBe(false);
    });

    it('returns true for two empty strings', () => {
      // Both buffers are zero-length — timingSafeEqual considers them equal
      expect(timingSafeCompare('', '')).toBe(true);
    });
  });
});
