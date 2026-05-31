import { describe, it, expect, beforeEach } from 'vitest';
import { resolveMindConfig } from '@kb-labs/mind-contracts';
import { createMind, type Mind } from '../../src/index';
import { makeTestServices, type TestServices } from '../../src/testing';

describe('mind — incremental sync', () => {
  let services: TestServices;
  let mind: Mind;

  beforeEach(async () => {
    services = makeTestServices();
    services.storage.seed('src/auth.ts', 'export function login() { return authenticate(); }');
    mind = createMind(services, resolveMindConfig({}), { now: () => 1000 });
    await mind.index({ indexId: 'code', scope: 'src/' });
  });

  it('sync add brings a new document into the index', async () => {
    services.storage.seed('src/cart.ts', 'export function addToCart(item) { cart.push(item); }');
    const res = await mind.syncAdd(['src/cart.ts'], 'code');
    expect(res.added).toBe(1);

    const found = await mind.search({ text: 'addToCart item cart', indexId: 'code' });
    expect(found.results.some((r) => r.file === 'src/cart.ts')).toBe(true);
  });

  it('sync delete removes a document and its chunks', async () => {
    const before = await services.vectorStore.count('code');
    expect(before).toBeGreaterThan(0);

    const res = await mind.syncDelete(['src/auth.ts'], 'code');
    expect(res.deleted).toBeGreaterThan(0);
    expect(await services.vectorStore.count('code')).toBe(0);

    const list = await mind.syncList('code');
    expect(list.documents).toEqual([]);
  });

  it('sync update replaces a document’s chunks (no duplication)', async () => {
    services.storage.seed('src/auth.ts', 'export function login() { return verifyCredentials(); }');
    await mind.syncUpdate(['src/auth.ts'], 'code');

    const status = await mind.syncStatus('code');
    expect(status.documents).toBe(1);

    const found = await mind.search({ text: 'verifyCredentials', indexId: 'code' });
    expect(found.results[0]?.file).toBe('src/auth.ts');
    expect(found.results[0]?.snippet).toContain('verifyCredentials');
  });

  it('sync list reflects synced documents', async () => {
    services.storage.seed('src/cart.ts', 'export function addToCart() {}');
    await mind.syncAdd(['src/cart.ts'], 'code');
    const list = await mind.syncList('code');
    expect(list.documents.map((d) => d.path).sort()).toEqual(['src/auth.ts', 'src/cart.ts']);
  });
});
