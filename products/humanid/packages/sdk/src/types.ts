/**
 * HumanID SDK Type Definitions
 */

// ==================== Auth ====================

export interface AuthTokens {
  id: string;
  email: string;
  role: string;
  access_token: string;
  refresh_token: string;
}

// ==================== DIDs ====================

export interface DID {
  id: string;
  did: string;
  method: string;
  publicKey: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  document?: Record<string, unknown> | null;
  documentVersion?: number | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DIDList {
  dids: DID[];
  total: number;
}

// ==================== Credentials ====================

export interface Credential {
  id: string;
  credentialType: string;
  status: 'OFFERED' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'SUSPENDED';
  claims?: Record<string, unknown> | null;
  proof?: Record<string, unknown>;
  credentialHash?: string;
  holderDid?: string;
  issuerDid?: string;
  holderDidId?: string;
  issuerDidId?: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt?: string | null;
  acceptedAt?: string | null;
}

export interface CredentialList {
  credentials: Credential[];
  total: number;
}

export interface IssueCredentialParams {
  holderDidId: string;
  issuerDidId: string;
  credentialType: string;
  claims: Record<string, unknown>;
  expiresAt?: string;
}

// ==================== Verification ====================

export interface VerificationCheck {
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  credentialId: string;
  verified: boolean;
  checks: {
    signature: VerificationCheck;
    issuerTrust: VerificationCheck;
    revocation: VerificationCheck;
    expiry: VerificationCheck;
  };
  verifiedAt: string;
}

// ==================== Wallet ====================

export interface WalletCredential {
  id: string;
  credentialType: string;
  status: string;
  issuerDid: string;
  issuedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
}

export interface WalletCredentialList {
  credentials: WalletCredential[];
  total: number;
}

// ==================== Issuers ====================

export interface IssuerProfile {
  id: string;
  organizationName: string;
  legalEntityId?: string | null;
  trustStatus: 'PENDING' | 'TRUSTED' | 'REVOKED';
  did?: string;
  didStatus?: string;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ==================== Templates ====================

export interface CredentialTemplate {
  id: string;
  name: string;
  credentialType: string;
  schema: Record<string, unknown>;
  requiredAttributes: string[];
  optionalAttributes: string[];
  defaultExpiryDays?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TemplateList {
  templates: CredentialTemplate[];
  total: number;
}

export interface CreateTemplateParams {
  name: string;
  credentialType: string;
  schema: Record<string, unknown>;
  requiredAttributes: string[];
  optionalAttributes: string[];
  defaultExpiryDays?: number;
}

// ==================== API Keys ====================

export interface ApiKey {
  id: string;
  key?: string; // Only present on creation
  keyPrefix: string;
  name: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  status: 'ACTIVE' | 'REVOKED';
  permissions: Record<string, boolean>;
  rateLimit: number;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface ApiKeyList {
  keys: ApiKey[];
  total: number;
}

// ==================== Passkeys ====================

export interface Passkey {
  id: string;
  credentialId: string;
  did: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PasskeyList {
  credentials: Passkey[];
  total: number;
}

// ==================== Errors ====================

export interface ErrorResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  request_id?: string;
}
