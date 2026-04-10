import { describe, it, expect } from 'vitest';
import {
  buildClientRecord,
  saveClient,
  getClient,
  verifyClientSecret,
  saveRefreshToken,
  consumeRefreshToken,
  savePublicKey,
  getPublicKey,
  generateClientId,
  generateClientSecret,
  generateHostId,
} from '../store.js';

// Minimal in-memory ICache implementation for tests
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

describe('id generators', () => {
  it('generates unique clientIds', () => {
    const a = generateClientId();
    const b = generateClientId();
    expect(a).toMatch(/^clt_/);
    expect(a).not.toBe(b);
  });

  it('generates unique secrets', () => {
    const a = generateClientSecret();
    const b = generateClientSecret();
    expect(a).toMatch(/^cs_/);
    expect(a).not.toBe(b);
  });

  it('generates unique hostIds', () => {
    const a = generateHostId();
    const b = generateHostId();
    expect(a).toMatch(/^host_/);
    expect(a).not.toBe(b);
  });
});

describe('client record', () => {
  it('buildClientRecord hashes the secret', () => {
    const secret = 'my-secret';
    const record = buildClientRecord({
      name: 'laptop',
      namespaceId: 'ns1',
      capabilities: ['filesystem'],
      secret,
    });
    expect(record.secretHash).not.toBe(secret);
    expect(record.secretHash).toHaveLength(64); // sha256 hex
  });

  it('saveClient / getClient round-trips', async () => {
    const cache = createMemCache() as any;
    const record = buildClientRecord({
      name: 'laptop',
      namespaceId: 'ns1',
      capabilities: [],
      secret: 'sec',
    });
    await saveClient(cache, record);
    const fetched = await getClient(cache, record.clientId);
    expect(fetched).not.toBeNull();
    expect(fetched!.clientId).toBe(record.clientId);
    expect(fetched!.hostId).toBe(record.hostId);
  });

  it('verifyClientSecret returns record on correct secret', async () => {
    const cache = createMemCache() as any;
    const secret = 'correct-secret';
    const record = buildClientRecord({ name: 'x', namespaceId: 'ns1', capabilities: [], secret });
    await saveClient(cache, record);

    const result = await verifyClientSecret(cache, record.clientId, secret);
    expect(result).not.toBeNull();
    expect(result!.hostId).toBe(record.hostId);
  });

  it('verifyClientSecret returns null on wrong secret', async () => {
    const cache = createMemCache() as any;
    const record = buildClientRecord({ name: 'x', namespaceId: 'ns1', capabilities: [], secret: 'correct' });
    await saveClient(cache, record);

    const result = await verifyClientSecret(cache, record.clientId, 'wrong');
    expect(result).toBeNull();
  });

  it('verifyClientSecret returns null for unknown clientId', async () => {
    const cache = createMemCache() as any;
    const result = await verifyClientSecret(cache, 'clt_nonexistent', 'any');
    expect(result).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('saveRefreshToken / consumeRefreshToken round-trips', async () => {
    const cache = createMemCache() as any;
    const token = 'refresh-token-value';
    await saveRefreshToken(cache, token, 'host_abc', 'ns1');

    const result = await consumeRefreshToken(cache, token);
    expect(result).not.toBeNull();
    expect(result!.hostId).toBe('host_abc');
    expect(result!.namespaceId).toBe('ns1');
  });

  it('consumeRefreshToken deletes the token (rotation)', async () => {
    const cache = createMemCache() as any;
    await saveRefreshToken(cache, 'tok', 'host_abc', 'ns1');

    await consumeRefreshToken(cache, 'tok');
    const second = await consumeRefreshToken(cache, 'tok');
    expect(second).toBeNull();
  });

  it('consumeRefreshToken returns null for unknown token', async () => {
    const cache = createMemCache() as any;
    const result = await consumeRefreshToken(cache, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('public keys', () => {
  it('savePublicKey / getPublicKey round-trips', async () => {
    const cache = createMemCache() as any;
    await savePublicKey(cache, 'host_abc', 'base64url-public-key');
    const key = await getPublicKey(cache, 'host_abc');
    expect(key).toBe('base64url-public-key');
  });

  it('getPublicKey returns null if not set', async () => {
    const cache = createMemCache() as any;
    const key = await getPublicKey(cache, 'host_unknown');
    expect(key).toBeNull();
  });
});
