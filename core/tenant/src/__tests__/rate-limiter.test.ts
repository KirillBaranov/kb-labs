import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StateBroker } from '@kb-labs/core-state-broker';
import { TenantRateLimiter } from '../rate-limiter.js';
import { DEFAULT_QUOTAS, getDefaultTenantId, getDefaultTenantTier, getQuotasForTier } from '../types.js';

function createMockBroker(): StateBroker {
  const store = new Map<string, { value: unknown; expires?: number }>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expires && entry.expires < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      store.set(key, {
        value,
        expires: ttl ? Date.now() + ttl : undefined,
      });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async clear(): Promise<void> {
      store.clear();
    },
  } as StateBroker;
}

describe('TenantRateLimiter', () => {
  let broker: StateBroker;
  let limiter: TenantRateLimiter;

  beforeEach(() => {
    broker = createMockBroker();
    limiter = new TenantRateLimiter(broker);
  });

  // ── checkLimit ───────────────────────────────────────────────────────

  it('allows requests under the limit', async () => {
    limiter.setTier('acme', 'free'); // 10 req/min

    const result = await limiter.checkLimit('acme', 'requests');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // 10 - 0 - 1
    expect(result.limit).toBe(10);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('blocks requests when limit is reached', async () => {
    limiter.setTier('acme', 'free'); // 10 req/min

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      await limiter.checkLimit('acme', 'requests');
    }

    const result = await limiter.checkLimit('acme', 'requests');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(10);
  });

  it('decrements remaining count with each request', async () => {
    limiter.setTier('acme', 'pro'); // 100 req/min

    const r1 = await limiter.checkLimit('acme', 'requests');
    const r2 = await limiter.checkLimit('acme', 'requests');
    const r3 = await limiter.checkLimit('acme', 'requests');

    expect(r1.remaining).toBe(99);
    expect(r2.remaining).toBe(98);
    expect(r3.remaining).toBe(97);
  });

  // ── tier-based quotas ────────────────────────────────────────────────

  it('uses free tier quotas by default (no quota set)', async () => {
    // No setTier/setQuotas called → defaults to free
    const result = await limiter.checkLimit('unknown-tenant', 'requests');

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(DEFAULT_QUOTAS.free.requestsPerMinute);
  });

  it('uses pro tier quotas', async () => {
    limiter.setTier('acme', 'pro');
    const result = await limiter.checkLimit('acme', 'requests');
    expect(result.limit).toBe(DEFAULT_QUOTAS.pro.requestsPerMinute);
  });

  it('uses enterprise tier quotas', async () => {
    limiter.setTier('acme', 'enterprise');
    const result = await limiter.checkLimit('acme', 'requests');
    expect(result.limit).toBe(DEFAULT_QUOTAS.enterprise.requestsPerMinute);
  });

  // ── custom quotas ───────────────────────────────────────────────────

  it('supports custom quotas', async () => {
    limiter.setQuotas('custom-tenant', {
      requestsPerMinute: 5,
      requestsPerDay: 100,
      maxConcurrentWorkflows: 1,
      maxStorageMB: 10,
      pluginExecutionsPerDay: 50,
    });

    const result = await limiter.checkLimit('custom-tenant', 'requests');
    expect(result.limit).toBe(5);
  });

  // ── resource types ──────────────────────────────────────────────────

  it('rate limits workflows separately from requests', async () => {
    limiter.setTier('acme', 'free'); // 1 concurrent workflow

    const r1 = await limiter.checkLimit('acme', 'workflows');
    expect(r1.allowed).toBe(true);
    expect(r1.limit).toBe(1);

    const r2 = await limiter.checkLimit('acme', 'workflows');
    expect(r2.allowed).toBe(false);
  });

  it('rate limits plugins resource', async () => {
    limiter.setTier('acme', 'free');
    const result = await limiter.checkLimit('acme', 'plugins');
    expect(result.allowed).toBe(true);
  });

  // ── tenant isolation ────────────────────────────────────────────────

  it('isolates rate limits between tenants', async () => {
    limiter.setTier('a', 'free'); // 10 req/min
    limiter.setTier('b', 'free');

    // Exhaust tenant A
    for (let i = 0; i < 10; i++) {
      await limiter.checkLimit('a', 'requests');
    }

    // Tenant B should still be allowed
    const resultB = await limiter.checkLimit('b', 'requests');
    expect(resultB.allowed).toBe(true);

    // Tenant A should be blocked
    const resultA = await limiter.checkLimit('a', 'requests');
    expect(resultA.allowed).toBe(false);
  });

  // ── resetAt ─────────────────────────────────────────────────────────

  it('resetAt is within the next minute', async () => {
    limiter.setTier('acme', 'free');
    const result = await limiter.checkLimit('acme', 'requests');

    const now = Date.now();
    expect(result.resetAt).toBeGreaterThan(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000);
  });
});

describe('types — helper functions', () => {
  it('getDefaultTenantId returns "default" when no env var', () => {
    const original = process.env.KB_TENANT_ID;
    delete process.env.KB_TENANT_ID;
    expect(getDefaultTenantId()).toBe('default');
    if (original) process.env.KB_TENANT_ID = original;
  });

  it('getDefaultTenantTier returns "free" when no env var', () => {
    const original = process.env.KB_TENANT_DEFAULT_TIER;
    delete process.env.KB_TENANT_DEFAULT_TIER;
    expect(getDefaultTenantTier()).toBe('free');
    if (original) process.env.KB_TENANT_DEFAULT_TIER = original;
  });

  it('getQuotasForTier returns a copy of tier quotas', () => {
    const quotas = getQuotasForTier('pro');
    expect(quotas).toEqual(DEFAULT_QUOTAS.pro);
    // Should be a copy, not same reference
    expect(quotas).not.toBe(DEFAULT_QUOTAS.pro);
  });

  it('DEFAULT_QUOTAS has all tiers defined', () => {
    expect(DEFAULT_QUOTAS.free).toBeDefined();
    expect(DEFAULT_QUOTAS.pro).toBeDefined();
    expect(DEFAULT_QUOTAS.enterprise).toBeDefined();
  });

  it('enterprise tier has unlimited daily requests (-1)', () => {
    expect(DEFAULT_QUOTAS.enterprise.requestsPerDay).toBe(-1);
    expect(DEFAULT_QUOTAS.enterprise.pluginExecutionsPerDay).toBe(-1);
  });
});
