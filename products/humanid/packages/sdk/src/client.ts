/**
 * HumanID SDK Client
 *
 * Main entry point for the SDK. Provides namespaced access to all API resources.
 */

import { HumanIDError, NetworkError } from './errors';
import type {
  AuthTokens,
  DID,
  DIDList,
  Credential,
  CredentialList,
  IssueCredentialParams,
  VerificationResult,
  WalletCredentialList,
  IssuerProfile,
  CredentialTemplate,
  TemplateList,
  CreateTemplateParams,
  ApiKey,
  ApiKeyList,
  PasskeyList,
  ErrorResponse,
} from './types';

export interface HumanIDConfig {
  /** API key (humanid_sk_...) or JWT access token */
  apiKey?: string;
  /** Base URL of the HumanID API */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retries on 5xx errors (default: 2) */
  retries?: number;
}

export class HumanID {
  private readonly config: Required<HumanIDConfig>;

  public readonly auth: AuthResource;
  public readonly dids: DIDResource;
  public readonly credentials: CredentialResource;
  public readonly verify: VerifyResource;
  public readonly wallet: WalletResource;
  public readonly issuers: IssuerResource;
  public readonly templates: TemplateResource;
  public readonly keys: ApiKeyResource;
  public readonly passkeys: PasskeyResource;

  constructor(config: HumanIDConfig = {}) {
    this.config = {
      apiKey: config.apiKey || '',
      baseUrl: (config.baseUrl || 'http://localhost:5013').replace(/\/$/, ''),
      timeout: config.timeout || 30000,
      retries: config.retries ?? 2,
    };

    const req = this.request.bind(this);

    this.auth = new AuthResource(req);
    this.dids = new DIDResource(req);
    this.credentials = new CredentialResource(req);
    this.verify = new VerifyResource(req);
    this.wallet = new WalletResource(req);
    this.issuers = new IssuerResource(req);
    this.templates = new TemplateResource(req);
    this.keys = new ApiKeyResource(req);
    this.passkeys = new PasskeyResource(req);
  }

  /** Update the API key or access token */
  setApiKey(apiKey: string): void {
    (this.config as { apiKey: string }).apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < this.config.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise((r) => setTimeout(r, delay));
          return this.request<T>(method, path, body, attempt + 1);
        }

        const errorBody = await response.json().catch(() => ({
          type: 'unknown',
          title: 'Unknown Error',
          status: response.status,
          detail: response.statusText,
        })) as ErrorResponse;

        throw new HumanIDError(errorBody);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HumanIDError) throw error;
      throw new NetworkError(
        `Request to ${method} ${path} failed`,
        error,
      );
    }
  }
}

type RequestFn = <T>(method: string, path: string, body?: unknown) => Promise<T>;

// ==================== Resource Classes ====================

class AuthResource {
  constructor(private req: RequestFn) {}

  register(email: string, password: string, role?: string): Promise<AuthTokens> {
    return this.req('POST', '/api/v1/auth/register', { email, password, role });
  }

  login(email: string, password: string): Promise<AuthTokens> {
    return this.req('POST', '/api/v1/auth/login', { email, password });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.req('POST', '/api/v1/auth/refresh', { refresh_token: refreshToken });
  }

  logout(options?: { all?: boolean; refreshToken?: string }): Promise<{ message: string }> {
    return this.req('POST', '/api/v1/auth/logout', {
      all: options?.all,
      refresh_token: options?.refreshToken,
    });
  }
}

class DIDResource {
  constructor(private req: RequestFn) {}

  create(): Promise<DID> {
    return this.req('POST', '/api/v1/dids', {});
  }

  list(): Promise<DIDList> {
    return this.req('GET', '/api/v1/dids');
  }

  get(id: string): Promise<DID> {
    return this.req('GET', `/api/v1/dids/${id}`);
  }

  updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<DID> {
    return this.req('PATCH', `/api/v1/dids/${id}`, { status });
  }

  deactivate(id: string): Promise<DID> {
    return this.req('DELETE', `/api/v1/dids/${id}`);
  }
}

class CredentialResource {
  constructor(private req: RequestFn) {}

  issue(params: IssueCredentialParams): Promise<Credential> {
    return this.req('POST', '/api/v1/credentials', params);
  }

  list(role?: 'holder' | 'issuer'): Promise<CredentialList> {
    const query = role ? `?role=${role}` : '';
    return this.req('GET', `/api/v1/credentials${query}`);
  }

  get(id: string): Promise<Credential> {
    return this.req('GET', `/api/v1/credentials/${id}`);
  }

  revoke(id: string, reason?: string): Promise<{ id: string; status: string; revokedAt: string }> {
    return this.req('POST', `/api/v1/credentials/${id}/revoke`, { reason });
  }
}

class VerifyResource {
  constructor(private req: RequestFn) {}

  credential(credentialId: string): Promise<VerificationResult> {
    return this.req('POST', '/api/v1/verify/credentials', { credentialId });
  }

  createRequest(holderDid: string, requestedAttributes: string[], expiresInHours?: number): Promise<Record<string, unknown>> {
    return this.req('POST', '/api/v1/verify/requests', {
      holderDid,
      requestedAttributes,
      expiresInHours,
    });
  }

  listRequests(): Promise<{ requests: Record<string, unknown>[]; total: number }> {
    return this.req('GET', '/api/v1/verify/requests');
  }

  getRequest(id: string): Promise<Record<string, unknown>> {
    return this.req('GET', `/api/v1/verify/requests/${id}`);
  }
}

class WalletResource {
  constructor(private req: RequestFn) {}

  listCredentials(): Promise<WalletCredentialList> {
    return this.req('GET', '/api/v1/wallet/credentials');
  }

  acceptCredential(id: string): Promise<{ id: string; status: string; message: string }> {
    return this.req('POST', `/api/v1/wallet/credentials/${id}/accept`);
  }
}

class IssuerResource {
  constructor(private req: RequestFn) {}

  register(didId: string, organizationName: string, legalEntityId?: string): Promise<IssuerProfile> {
    return this.req('POST', '/api/v1/issuers', { didId, organizationName, legalEntityId });
  }

  getProfile(): Promise<IssuerProfile> {
    return this.req('GET', '/api/v1/issuers/me');
  }

  updateProfile(updates: { organizationName?: string; legalEntityId?: string }): Promise<IssuerProfile> {
    return this.req('PATCH', '/api/v1/issuers/me', updates);
  }
}

class TemplateResource {
  constructor(private req: RequestFn) {}

  create(params: CreateTemplateParams): Promise<CredentialTemplate> {
    return this.req('POST', '/api/v1/templates', params);
  }

  list(): Promise<TemplateList> {
    return this.req('GET', '/api/v1/templates');
  }

  get(id: string): Promise<CredentialTemplate> {
    return this.req('GET', `/api/v1/templates/${id}`);
  }

  update(id: string, updates: Partial<CreateTemplateParams>): Promise<CredentialTemplate> {
    return this.req('PATCH', `/api/v1/templates/${id}`, updates);
  }

  deactivate(id: string): Promise<{ id: string; isActive: boolean }> {
    return this.req('DELETE', `/api/v1/templates/${id}`);
  }
}

class ApiKeyResource {
  constructor(private req: RequestFn) {}

  create(name: string, environment: 'SANDBOX' | 'PRODUCTION'): Promise<ApiKey> {
    return this.req('POST', '/api/v1/developer/keys', { name, environment });
  }

  list(): Promise<ApiKeyList> {
    return this.req('GET', '/api/v1/developer/keys');
  }

  rotate(id: string): Promise<ApiKey> {
    return this.req('POST', `/api/v1/developer/keys/${id}/rotate`);
  }

  revoke(id: string): Promise<{ id: string; status: string }> {
    return this.req('DELETE', `/api/v1/developer/keys/${id}`);
  }

  usage(): Promise<{ totalKeys: number; activeKeys: number; totalRequests: number }> {
    return this.req('GET', '/api/v1/developer/keys/usage');
  }
}

class PasskeyResource {
  constructor(private req: RequestFn) {}

  list(): Promise<PasskeyList> {
    return this.req('GET', '/api/v1/webauthn/credentials');
  }

  getRegistrationOptions(didId: string): Promise<Record<string, unknown>> {
    return this.req('POST', '/api/v1/webauthn/register/options', { didId });
  }

  remove(id: string): Promise<{ message: string }> {
    return this.req('DELETE', `/api/v1/webauthn/credentials/${id}`);
  }
}
