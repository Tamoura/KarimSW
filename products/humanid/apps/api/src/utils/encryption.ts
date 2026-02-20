/**
 * Shared AES-256-GCM Encryption Utilities
 *
 * Centralized encryption/decryption for claims, private keys, and secrets.
 * Format: iv:authTag:ciphertext (all base64)
 *
 * Environment: CLAIMS_ENCRYPTION_KEY (64-char hex = 32 bytes)
 */

import { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'crypto';

/**
 * Get the AES-256 encryption key from environment.
 * Throws if not configured.
 */
export function getEncryptionKey(): Buffer {
  const key = process.env.CLAIMS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CLAIMS_ENCRYPTION_KEY is required');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivB64, tagB64, dataB64] = encryptedStr.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt JSON claims to AES-256-GCM string.
 */
export function encryptClaims(claims: Record<string, unknown>): string {
  return encrypt(JSON.stringify(claims));
}

/**
 * Decrypt AES-256-GCM string back to JSON claims.
 */
export function decryptClaims(encryptedClaims: string): Record<string, unknown> {
  return JSON.parse(decrypt(encryptedClaims));
}

/**
 * Encrypt a private key hex string.
 */
export function encryptPrivateKey(privateKeyHex: string): string {
  return encrypt(privateKeyHex);
}

/**
 * Decrypt an encrypted private key back to hex string.
 */
export function decryptPrivateKey(encrypted: string): string {
  return decrypt(encrypted);
}

/**
 * Derive an HMAC key for a specific purpose (e.g. offline token signing).
 * Uses CLAIMS_ENCRYPTION_KEY as the root secret with a purpose-specific salt.
 */
export function deriveHmacKey(purpose: string, identifier: string): string {
  const rootKey = getEncryptionKey();
  return createHmac('sha256', rootKey)
    .update(`${purpose}:${identifier}`)
    .digest('hex');
}

/**
 * Timing-safe comparison of two hex strings.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
