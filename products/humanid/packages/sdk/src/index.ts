/**
 * @humanid/sdk - HumanID TypeScript SDK
 *
 * The official SDK for integrating with the HumanID identity platform.
 * Provides type-safe access to DIDs, credentials, verification, and more.
 *
 * @example
 * ```typescript
 * import { HumanID } from '@humanid/sdk';
 *
 * const humanid = new HumanID({ apiKey: 'humanid_sk_...' });
 *
 * // Create a DID
 * const did = await humanid.dids.create();
 *
 * // Issue a credential
 * const credential = await humanid.credentials.issue({
 *   holderDidId: did.id,
 *   issuerDidId: myDid.id,
 *   credentialType: 'UniversityDegree',
 *   claims: { degree: 'BSc', university: 'MIT' },
 * });
 *
 * // Verify a credential
 * const result = await humanid.verify.credential(credential.id);
 * console.log(result.verified); // true
 * ```
 */

export { HumanID } from './client';
export type { HumanIDConfig } from './client';
export type {
  DID,
  DIDList,
  Credential,
  CredentialList,
  VerificationResult,
  VerificationCheck,
  IssuerProfile,
  CredentialTemplate,
  TemplateList,
  ApiKey,
  ApiKeyList,
  AuthTokens,
  WalletCredential,
  WalletCredentialList,
  PasskeyList,
  ErrorResponse,
} from './types';
export { HumanIDError } from './errors';
