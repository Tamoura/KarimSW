/**
 * HumanID SDK Integration Tests
 *
 * Tests the SDK against a running API server.
 * Requires: API at http://localhost:5013
 */

import { HumanID, HumanIDError } from '../src';

const API_URL = 'http://localhost:5013';

describe('@humanid/sdk', () => {
  let sdk: HumanID;
  const testEmail = `sdk-test-${Date.now()}@example.com`;
  const testPassword = 'Test123!@#';

  beforeAll(() => {
    sdk = new HumanID({ baseUrl: API_URL });
  });

  describe('Auth', () => {
    it('should register a new user', async () => {
      const result = await sdk.auth.register(testEmail, testPassword, 'DEVELOPER');
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.email).toBe(testEmail);
      sdk.setApiKey(result.access_token);
    });

    it('should login', async () => {
      const result = await sdk.auth.login(testEmail, testPassword);
      expect(result).toHaveProperty('access_token');
      sdk.setApiKey(result.access_token);
    });
  });

  describe('DIDs', () => {
    let didId: string;

    it('should create a DID', async () => {
      const did = await sdk.dids.create();
      expect(did).toHaveProperty('id');
      expect(did).toHaveProperty('did');
      expect(did.did).toMatch(/^did:humanid:/);
      expect(did.status).toBe('ACTIVE');
      didId = did.id;
    });

    it('should list DIDs', async () => {
      const result = await sdk.dids.list();
      expect(result.dids.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should get a DID by ID', async () => {
      const did = await sdk.dids.get(didId);
      expect(did.id).toBe(didId);
      expect(did).toHaveProperty('document');
    });

    it('should suspend and reactivate a DID', async () => {
      const suspended = await sdk.dids.updateStatus(didId, 'SUSPENDED');
      expect(suspended.status).toBe('SUSPENDED');

      const reactivated = await sdk.dids.updateStatus(didId, 'ACTIVE');
      expect(reactivated.status).toBe('ACTIVE');
    });
  });

  describe('Credentials', () => {
    let issuerDidId: string;
    let holderDidId: string;
    let credentialId: string;

    beforeAll(async () => {
      // Create two DIDs - one as issuer, one as holder
      const issuerDid = await sdk.dids.create();
      issuerDidId = issuerDid.id;

      const holderDid = await sdk.dids.create();
      holderDidId = holderDid.id;
    });

    it('should issue a credential', async () => {
      const cred = await sdk.credentials.issue({
        holderDidId,
        issuerDidId,
        credentialType: 'SDKTestCredential',
        claims: { score: 100, level: 'expert' },
      });

      expect(cred).toHaveProperty('id');
      expect(cred.credentialType).toBe('SDKTestCredential');
      expect(cred.status).toBe('OFFERED');
      credentialId = cred.id;
    });

    it('should list credentials', async () => {
      const result = await sdk.credentials.list();
      expect(result.credentials.length).toBeGreaterThan(0);
    });

    it('should get a credential', async () => {
      const cred = await sdk.credentials.get(credentialId);
      expect(cred.id).toBe(credentialId);
    });

    it('should verify a credential', async () => {
      const result = await sdk.verify.credential(credentialId);
      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('checks');
      expect(result.checks).toHaveProperty('signature');
      expect(result.checks).toHaveProperty('issuerTrust');
      expect(result.checks).toHaveProperty('revocation');
      expect(result.checks).toHaveProperty('expiry');
    });

    it('should revoke a credential', async () => {
      const result = await sdk.credentials.revoke(credentialId, 'SDK test');
      expect(result.status).toBe('REVOKED');
    });
  });

  describe('API Keys', () => {
    let keyId: string;

    it('should create an API key', async () => {
      const key = await sdk.keys.create('SDK Test Key', 'SANDBOX');
      expect(key).toHaveProperty('key');
      expect(key.key).toMatch(/^humanid_sk_/);
      expect(key.environment).toBe('SANDBOX');
      keyId = key.id;
    });

    it('should list API keys', async () => {
      const result = await sdk.keys.list();
      expect(result.keys.length).toBeGreaterThan(0);
    });

    it('should get usage stats', async () => {
      const usage = await sdk.keys.usage();
      expect(usage).toHaveProperty('totalKeys');
      expect(usage).toHaveProperty('activeKeys');
    });

    it('should revoke an API key', async () => {
      const result = await sdk.keys.revoke(keyId);
      expect(result.status).toBe('REVOKED');
    });
  });

  describe('Error handling', () => {
    it('should throw HumanIDError on 404', async () => {
      try {
        await sdk.dids.get('00000000-0000-0000-0000-000000000000');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(HumanIDError);
        expect((error as HumanIDError).status).toBe(404);
      }
    });

    it('should throw HumanIDError without auth', async () => {
      const noAuth = new HumanID({ baseUrl: API_URL });
      try {
        await noAuth.dids.list();
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(HumanIDError);
        // Server returns 401 for missing auth
        expect((error as HumanIDError).status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
