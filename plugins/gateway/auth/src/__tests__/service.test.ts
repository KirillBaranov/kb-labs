import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../service.js';

const jwtConfig = { secret: 'test-secret-at-least-32-chars-long!!' };

function createMemCache() {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T, _ttl?: number): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async clear(): Promise<void> {
      store.clear();
    },
  };
}

describe('AuthService', () => {
  let cache: ReturnType<typeof createMemCache>;
  let service: AuthService;

  beforeEach(() => {
    cache = createMemCache();
    service = new AuthService(cache as any, jwtConfig);
  });

  describe('register', () => {
    it('returns clientId, clientSecret, hostId, and server-generated namespaceId', async () => {
      const result = await service.register({
        name: 'MacBook',
        capabilities: ['filesystem'],
      });
      expect(result.clientId).toMatch(/^clt_/);
      expect(result.clientSecret).toMatch(/^cs_/);
      expect(result.hostId).toMatch(/^host_/);
      expect(result.namespaceId).toMatch(/^ns_/);
    });

    it('generates a unique namespaceId per registration (no impersonation)', async () => {
      const a = await service.register({ name: 'A', capabilities: [] });
      const b = await service.register({ name: 'B', capabilities: [] });
      expect(a.namespaceId).not.toBe(b.namespaceId);
    });

    it('saves public key when provided', async () => {
      const result = await service.register({
        name: 'laptop',
        capabilities: [],
        publicKey: 'my-pub-key',
      });
      const stored = await cache.get<string>(`auth:publickey:${result.hostId}`);
      expect(stored).toBe('my-pub-key');
    });
  });

  describe('issueTokens', () => {
    it('returns token pair on valid credentials', async () => {
      const { clientId, clientSecret } = await service.register({
        name: 'laptop',
        capabilities: [],
      });

      const tokens = await service.issueTokens(clientId, clientSecret);
      expect(tokens).not.toBeNull();
      expect(tokens!.accessToken).toBeTruthy();
      expect(tokens!.refreshToken).toBeTruthy();
      expect(tokens!.tokenType).toBe('Bearer');
      expect(tokens!.expiresIn).toBe(15 * 60);
    });

    it('returns null on wrong secret', async () => {
      const { clientId } = await service.register({
        name: 'laptop',
        capabilities: [],
      });

      const tokens = await service.issueTokens(clientId, 'wrong-secret');
      expect(tokens).toBeNull();
    });

    it('returns null for unknown clientId', async () => {
      const tokens = await service.issueTokens('clt_unknown', 'any');
      expect(tokens).toBeNull();
    });
  });

  describe('verify', () => {
    it('returns AuthContext for valid access token', async () => {
      const { clientId, clientSecret } = await service.register({
        name: 'laptop',
        capabilities: [],
      });
      const tokens = await service.issueTokens(clientId, clientSecret);

      const ctx = await service.verify(tokens!.accessToken);
      expect(ctx).not.toBeNull();
      expect(ctx!.type).toBe('machine');
      expect(ctx!.namespaceId).toMatch(/^ns_/);
    });

    it('returns null for garbage token', async () => {
      const ctx = await service.verify('not-a-jwt');
      expect(ctx).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('issues new token pair on valid refresh token', async () => {
      const { clientId, clientSecret } = await service.register({
        name: 'laptop',
        capabilities: [],
      });
      const first = await service.issueTokens(clientId, clientSecret);

      const second = await service.refreshTokens(first!.refreshToken);
      expect(second).not.toBeNull();
      expect(second!.accessToken).toBeTruthy();
      expect(second!.refreshToken).not.toBe(first!.refreshToken); // rotated
    });

    it('rejects the same refresh token twice (rotation)', async () => {
      const { clientId, clientSecret } = await service.register({
        name: 'laptop',
        capabilities: [],
      });
      const first = await service.issueTokens(clientId, clientSecret);

      await service.refreshTokens(first!.refreshToken);
      const third = await service.refreshTokens(first!.refreshToken);
      expect(third).toBeNull();
    });

    it('returns null for garbage refresh token', async () => {
      const result = await service.refreshTokens('not-a-jwt');
      expect(result).toBeNull();
    });
  });
});
