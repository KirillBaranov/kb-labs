import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostRegistry } from '../hosts/registry.js';
import type { ICache } from '@kb-labs/core-platform';
import type { HostDescriptor, IHostStore } from '@kb-labs/gateway-contracts';

function makeCache(): { cache: ICache; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const cache: ICache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    clear: vi.fn(async () => { store.clear(); }),
  } as unknown as ICache;
  return { cache, store };
}

describe('HostRegistry.register', () => {
  it('creates a new host descriptor with offline status', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);

    const result = await registry.register({
      name: 'laptop',
      namespaceId: 'ns-1',
      capabilities: ['filesystem', 'git'],
      workspacePaths: ['/home/user/projects'],
    });

    expect(result.descriptor.name).toBe('laptop');
    expect(result.descriptor.namespaceId).toBe('ns-1');
    expect(result.descriptor.status).toBe('offline');
    expect(result.descriptor.capabilities).toEqual(['filesystem', 'git']);
    expect(result.descriptor.connections).toEqual([]);
    expect(result.descriptor.hostId).toBeTypeOf('string');
    expect(result.machineToken).toBeTypeOf('string');
    expect(result.machineToken).not.toBe(result.descriptor.hostId);
  });

  it('stores descriptor and token in cache', async () => {
    const { cache, store } = makeCache();
    const registry = new HostRegistry(cache);

    const result = await registry.register({
      name: 'srv',
      namespaceId: 'ns-2',
      capabilities: ['filesystem'],
      workspacePaths: [],
    });

    const registryKey = `host:registry:ns-2:${result.descriptor.hostId}`;
    const tokenKey = `host:token:${result.machineToken}`;

    expect(store.has(registryKey)).toBe(true);
    expect(store.has(tokenKey)).toBe(true);

    const tokenEntry = store.get(tokenKey) as { hostId: string; namespaceId: string };
    expect(tokenEntry.hostId).toBe(result.descriptor.hostId);
    expect(tokenEntry.namespaceId).toBe('ns-2');
  });

  it('generates unique hostId and token per registration', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);
    const reg = { name: 'h', namespaceId: 'ns', capabilities: [] as [], workspacePaths: [] };

    const r1 = await registry.register(reg);
    const r2 = await registry.register(reg);

    expect(r1.descriptor.hostId).not.toBe(r2.descriptor.hostId);
    expect(r1.machineToken).not.toBe(r2.machineToken);
  });
});

describe('HostRegistry.setOnline / setOffline', () => {
  let cache: ICache;
  let store: Map<string, unknown>;
  let registry: HostRegistry;
  let hostId: string;

  beforeEach(async () => {
    ({ cache, store } = makeCache());
    registry = new HostRegistry(cache);
    const result = await registry.register({
      name: 'test-host', namespaceId: 'ns-1', capabilities: ['filesystem'], workspacePaths: [],
    });
    hostId = result.descriptor.hostId;
  });

  it('sets status to online and adds connectionId', async () => {
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    const host = store.get(`host:registry:ns-1:${hostId}`) as HostDescriptor;
    expect(host.status).toBe('online');
    expect(host.connections).toContain('conn-a');
  });

  it('deduplicates connections on repeated setOnline', async () => {
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    const host = store.get(`host:registry:ns-1:${hostId}`) as HostDescriptor;
    expect(host.connections).toHaveLength(1);
  });

  it('each setOnline replaces connections with the new connectionId', async () => {
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    await registry.setOnline(hostId, 'ns-1', 'conn-b');
    const host = store.get(`host:registry:ns-1:${hostId}`) as HostDescriptor;
    // New connection replaces stale ones — no accumulation across reconnects
    expect(host.connections).toEqual(['conn-b']);
    expect(host.status).toBe('online');
  });

  it('enters reconnecting status when last connection removed (grace period)', async () => {
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    await registry.setOffline(hostId, 'ns-1', 'conn-a');
    const host = store.get(`host:registry:ns-1:${hostId}`) as HostDescriptor;
    expect(host.status).toBe('reconnecting');
    expect(host.connections).toHaveLength(0);
  });

  it('stays online when disconnected connectionId is not the current one', async () => {
    // setOnline(conn-b) replaces list → connections=['conn-b']
    // setOffline(conn-a) removes conn-a which is gone → connections=['conn-b'] → still online
    await registry.setOnline(hostId, 'ns-1', 'conn-a');
    await registry.setOnline(hostId, 'ns-1', 'conn-b');
    await registry.setOffline(hostId, 'ns-1', 'conn-a');
    const host = store.get(`host:registry:ns-1:${hostId}`) as HostDescriptor;
    expect(host.status).toBe('online');
    expect(host.connections).toEqual(['conn-b']);
  });

  it('does nothing if host not found', async () => {
    await expect(registry.setOnline('nonexistent', 'ns-1', 'conn-x')).resolves.toBeUndefined();
    await expect(registry.setOffline('nonexistent', 'ns-1', 'conn-x')).resolves.toBeUndefined();
  });
});

describe('HostRegistry.heartbeat', () => {
  it('updates lastSeen timestamp', async () => {
    const { cache, store } = makeCache();
    const registry = new HostRegistry(cache);
    const before = Date.now();

    const { descriptor } = await registry.register({
      name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });

    await new Promise((r) => { setTimeout(r, 5); }); // small delay
    await registry.heartbeat(descriptor.hostId, 'ns');

    const host = store.get(`host:registry:ns:${descriptor.hostId}`) as HostDescriptor;
    expect(host.lastSeen).toBeGreaterThan(before);
  });
});

describe('HostRegistry.get', () => {
  it('returns host descriptor by id', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);
    const { descriptor } = await registry.register({
      name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });

    const found = await registry.get(descriptor.hostId, 'ns');
    expect(found).not.toBeNull();
    expect(found!.hostId).toBe(descriptor.hostId);
  });

  it('returns null for unknown host', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);
    expect(await registry.get('ghost', 'ns')).toBeNull();
  });
});

describe('HostRegistry.resolveToken', () => {
  it('returns hostId/namespaceId for valid machine token', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);
    const { machineToken, descriptor } = await registry.register({
      name: 'h', namespaceId: 'ns-1', capabilities: [], workspacePaths: [],
    });

    const resolved = await registry.resolveToken(machineToken);
    expect(resolved).not.toBeNull();
    expect(resolved!.hostId).toBe(descriptor.hostId);
    expect(resolved!.namespaceId).toBe('ns-1');
  });

  it('returns null for unknown token', async () => {
    const { cache } = makeCache();
    const registry = new HostRegistry(cache);
    expect(await registry.resolveToken('bad-token')).toBeNull();
  });
});

// ── Dual-layer tests (cache + store) ──────────────────────────────

function makeHostStore(): { hostStore: IHostStore; hosts: Map<string, HostDescriptor>; tokens: Map<string, { hostId: string; namespaceId: string }> } {
  const hosts = new Map<string, HostDescriptor>();
  const tokens = new Map<string, { hostId: string; namespaceId: string }>();

  const hostStore: IHostStore = {
    save: vi.fn(async (d: HostDescriptor) => { hosts.set(`${d.hostId}:${d.namespaceId}`, d); }),
    get: vi.fn(async (hostId: string, ns: string) => hosts.get(`${hostId}:${ns}`) ?? null),
    list: vi.fn(async (ns: string) => [...hosts.values()].filter(h => h.namespaceId === ns)),
    listAll: vi.fn(async () => [...hosts.values()]),
    delete: vi.fn(async (hostId: string, ns: string) => {
      const key = `${hostId}:${ns}`;
      if (!hosts.has(key)) {return false;}
      hosts.delete(key);
      // Also remove tokens for this host
      for (const [tok, entry] of tokens) {
        if (entry.hostId === hostId && entry.namespaceId === ns) {tokens.delete(tok);}
      }
      return true;
    }),
    saveToken: vi.fn(async (token: string, hostId: string, ns: string) => { tokens.set(token, { hostId, namespaceId: ns }); }),
    resolveToken: vi.fn(async (token: string) => tokens.get(token) ?? null),
    deleteToken: vi.fn(async (token: string) => { tokens.delete(token); }),
  };

  return { hostStore, hosts, tokens };
}

describe('HostRegistry with IHostStore (dual-layer)', () => {
  describe('register', () => {
    it('writes to both cache and store', async () => {
      const { cache } = makeCache();
      const { hostStore, hosts, tokens } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      const result = await registry.register({
        name: 'dual-host', namespaceId: 'ns', capabilities: ['filesystem'], workspacePaths: [],
      });

      // Store has the host
      expect(hosts.size).toBe(1);
      const stored = [...hosts.values()][0]!;
      expect(stored.hostId).toBe(result.descriptor.hostId);
      expect(stored.name).toBe('dual-host');

      // Store has the token
      expect(tokens.size).toBe(1);
      const tokenEntry = [...tokens.values()][0]!;
      expect(tokenEntry.hostId).toBe(result.descriptor.hostId);

      // store.save and store.saveToken were called
      expect(hostStore.save).toHaveBeenCalledTimes(1);
      expect(hostStore.saveToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('restore', () => {
    it('loads all hosts from store into cache as offline', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, hosts } = makeHostStore();

      // Pre-populate store with 2 hosts
      const h1: HostDescriptor = {
        hostId: 'h1', name: 'host-one', namespaceId: 'ns',
        capabilities: ['filesystem'], status: 'online', lastSeen: 100,
        connections: ['old-conn'], createdAt: 100, updatedAt: 100,
      };
      const h2: HostDescriptor = {
        hostId: 'h2', name: 'host-two', namespaceId: 'ns',
        capabilities: ['git'], status: 'online', lastSeen: 200,
        connections: ['old-conn-2'], createdAt: 200, updatedAt: 200,
      };
      hosts.set('h1:ns', h1);
      hosts.set('h2:ns', h2);

      const registry = new HostRegistry(cache, hostStore);
      const count = await registry.restore();

      expect(count).toBe(2);

      // Both in cache, but as offline with no connections
      const cached1 = cacheMap.get('host:registry:ns:h1') as HostDescriptor;
      expect(cached1.status).toBe('offline');
      expect(cached1.connections).toEqual([]);
      expect(cached1.name).toBe('host-one');

      const cached2 = cacheMap.get('host:registry:ns:h2') as HostDescriptor;
      expect(cached2.status).toBe('offline');
      expect(cached2.connections).toEqual([]);
    });

    it('returns 0 when store is empty', async () => {
      const { cache } = makeCache();
      const { hostStore } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      expect(await registry.restore()).toBe(0);
    });

    it('returns 0 when no store provided', async () => {
      const { cache } = makeCache();
      const registry = new HostRegistry(cache);

      expect(await registry.restore()).toBe(0);
    });
  });

  describe('get (cache miss → store fallback)', () => {
    it('falls through to store when cache misses', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, hosts } = makeHostStore();

      // Host in store but NOT in cache
      hosts.set('h1:ns', {
        hostId: 'h1', name: 'stored-host', namespaceId: 'ns',
        capabilities: ['filesystem'], status: 'online', lastSeen: 100,
        connections: ['old'], createdAt: 100, updatedAt: 100,
      });

      const registry = new HostRegistry(cache, hostStore);
      const result = await registry.get('h1', 'ns');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('stored-host');
      expect(result!.status).toBe('offline'); // always offline from store
      expect(result!.connections).toEqual([]);

      // Cache should now be warmed
      expect(cacheMap.has('host:registry:ns:h1')).toBe(true);
    });

    it('returns null when both cache and store miss', async () => {
      const { cache } = makeCache();
      const { hostStore } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      expect(await registry.get('ghost', 'ns')).toBeNull();
    });

    it('prefers cache over store', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, hosts } = makeHostStore();

      // Same host in both, different names
      cacheMap.set('host:registry:ns:h1', {
        hostId: 'h1', name: 'cache-version', namespaceId: 'ns',
        capabilities: [], status: 'online', lastSeen: 200,
        connections: ['live-conn'],
      });
      hosts.set('h1:ns', {
        hostId: 'h1', name: 'store-version', namespaceId: 'ns',
        capabilities: [], status: 'offline', lastSeen: 100,
        connections: [], createdAt: 100, updatedAt: 100,
      });

      const registry = new HostRegistry(cache, hostStore);
      const result = await registry.get('h1', 'ns');

      expect(result!.name).toBe('cache-version');
      expect(result!.status).toBe('online');
      expect(hostStore.get).not.toHaveBeenCalled();
    });
  });

  describe('resolveToken (cache miss → store fallback)', () => {
    it('falls through to store when cache misses', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, tokens } = makeHostStore();

      tokens.set('secret-tok', { hostId: 'h1', namespaceId: 'ns' });

      const registry = new HostRegistry(cache, hostStore);
      const resolved = await registry.resolveToken('secret-tok');

      expect(resolved).toEqual({ hostId: 'h1', namespaceId: 'ns' });
      // Cache warmed
      expect(cacheMap.has('host:token:secret-tok')).toBe(true);
    });
  });

  describe('list (store authoritative)', () => {
    it('uses store as source of truth, enriches with cache status', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, hosts } = makeHostStore();

      // 2 hosts in store
      hosts.set('h1:ns', {
        hostId: 'h1', name: 'one', namespaceId: 'ns',
        capabilities: [], status: 'offline', lastSeen: 100,
        connections: [], createdAt: 100, updatedAt: 100,
      });
      hosts.set('h2:ns', {
        hostId: 'h2', name: 'two', namespaceId: 'ns',
        capabilities: [], status: 'offline', lastSeen: 100,
        connections: [], createdAt: 100, updatedAt: 100,
      });

      // h1 is online in cache
      cacheMap.set('host:registry:ns:h1', {
        hostId: 'h1', name: 'one', namespaceId: 'ns',
        capabilities: [], status: 'online', lastSeen: 200,
        connections: ['conn-live'],
      });

      const registry = new HostRegistry(cache, hostStore);
      const result = await registry.list('ns');

      expect(result).toHaveLength(2);

      const h1 = result.find(h => h.hostId === 'h1')!;
      expect(h1.status).toBe('online'); // enriched from cache

      const h2 = result.find(h => h.hostId === 'h2')!;
      expect(h2.status).toBe('offline'); // no cache entry
    });
  });

  describe('deregister', () => {
    it('removes from both cache and store', async () => {
      const { cache, store: cacheMap } = makeCache();
      const { hostStore, hosts } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      const { descriptor } = await registry.register({
        name: 'doomed', namespaceId: 'ns', capabilities: [], workspacePaths: [],
      });

      expect(hosts.size).toBe(1);
      expect(cacheMap.has(`host:registry:ns:${descriptor.hostId}`)).toBe(true);

      const deleted = await registry.deregister(descriptor.hostId, 'ns');
      expect(deleted).toBe(true);

      // Gone from store
      expect(hosts.size).toBe(0);
      // Gone from cache
      expect(cacheMap.has(`host:registry:ns:${descriptor.hostId}`)).toBe(false);
    });

    it('returns false for non-existent host', async () => {
      const { cache } = makeCache();
      const { hostStore } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      expect(await registry.deregister('ghost', 'ns')).toBe(false);
    });
  });

  describe('ensureRegistered', () => {
    it('persists to store when host does not exist', async () => {
      const { cache } = makeCache();
      const { hostStore, hosts } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      await registry.ensureRegistered('h1', 'ns', 'new-host', ['filesystem']);

      expect(hosts.size).toBe(1);
      expect(hosts.get('h1:ns')!.name).toBe('new-host');
      expect(hostStore.save).toHaveBeenCalledTimes(1);
    });

    it('updates capabilities in store when they change', async () => {
      const { cache } = makeCache();
      const { hostStore, hosts } = makeHostStore();
      const registry = new HostRegistry(cache, hostStore);

      await registry.ensureRegistered('h1', 'ns', 'host', ['filesystem']);
      await registry.ensureRegistered('h1', 'ns', 'host', ['filesystem', 'git']);

      expect(hosts.get('h1:ns')!.capabilities).toEqual(['filesystem', 'git']);
      expect(hostStore.save).toHaveBeenCalledTimes(2);
    });
  });
});

describe('HostRegistry grace period', () => {
  it('sets status to reconnecting on last connection close', async () => {
    const { cache, store: cacheMap } = makeCache();
    const registry = new HostRegistry(cache, undefined, { reconnectGraceMs: 100 });

    const { descriptor } = await registry.register({
      name: 'grace-host', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });
    await registry.setOnline(descriptor.hostId, 'ns', 'conn-1');
    await registry.setOffline(descriptor.hostId, 'ns', 'conn-1');

    const host = cacheMap.get(`host:registry:ns:${descriptor.hostId}`) as HostDescriptor;
    expect(host.status).toBe('reconnecting');
  });

  it('cancels grace timer when host reconnects before expiry', async () => {
    const { cache, store: cacheMap } = makeCache();
    const registry = new HostRegistry(cache, undefined, { reconnectGraceMs: 200 });

    const { descriptor } = await registry.register({
      name: 'grace-host', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });
    await registry.setOnline(descriptor.hostId, 'ns', 'conn-1');
    await registry.setOffline(descriptor.hostId, 'ns', 'conn-1');

    // Reconnect before grace expires
    await registry.setOnline(descriptor.hostId, 'ns', 'conn-2');

    const host = cacheMap.get(`host:registry:ns:${descriptor.hostId}`) as HostDescriptor;
    expect(host.status).toBe('online');
    expect(host.connections).toEqual(['conn-2']);

    // Wait past grace — should still be online (timer was cancelled)
    await new Promise(r => { setTimeout(r, 250); });
    const after = cacheMap.get(`host:registry:ns:${descriptor.hostId}`) as HostDescriptor;
    expect(after.status).toBe('online');
  });

  it('transitions to offline after grace period expires', async () => {
    const { cache, store: cacheMap } = makeCache();
    const registry = new HostRegistry(cache, undefined, { reconnectGraceMs: 50 });

    const { descriptor } = await registry.register({
      name: 'grace-host', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });
    await registry.setOnline(descriptor.hostId, 'ns', 'conn-1');
    await registry.setOffline(descriptor.hostId, 'ns', 'conn-1');

    // Wait for grace to expire
    await new Promise(r => { setTimeout(r, 100); });

    const host = cacheMap.get(`host:registry:ns:${descriptor.hostId}`) as HostDescriptor;
    expect(host.status).toBe('offline');
  });

  it('stays online when other connections remain', async () => {
    const { cache, store: cacheMap } = makeCache();
    const registry = new HostRegistry(cache, undefined, { reconnectGraceMs: 100 });

    const { descriptor } = await registry.register({
      name: 'multi-conn', namespaceId: 'ns', capabilities: [], workspacePaths: [],
    });
    await registry.setOnline(descriptor.hostId, 'ns', 'conn-1');
    // setOnline replaces connections, so simulate by directly setting
    const key = `host:registry:ns:${descriptor.hostId}`;
    const h = cacheMap.get(key) as HostDescriptor;
    cacheMap.set(key, { ...h, connections: ['conn-1', 'conn-2'] });

    await registry.setOffline(descriptor.hostId, 'ns', 'conn-1');

    const host = cacheMap.get(key) as HostDescriptor;
    expect(host.status).toBe('online');
    expect(host.connections).toEqual(['conn-2']);
  });
});
