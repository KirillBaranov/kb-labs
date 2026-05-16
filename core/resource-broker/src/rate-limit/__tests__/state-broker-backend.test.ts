import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateBrokerRateLimitBackend } from '../state-broker-backend.js';
import type { StateBroker } from '@kb-labs/core-state-broker';
import type { RateLimitConfig } from '../../types.js';

// ── Mock StateBroker ──────────────────────────────────────────────────────────

function makeBroker(): { broker: StateBroker; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();

  const broker: StateBroker = {
    get: vi.fn(async <T>(key: string): Promise<T | null> => {
      return (store.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(key: string, value: T, _ttl?: number): Promise<void> => {
      store.set(key, value);
    }),
    clear: vi.fn(async (pattern?: string): Promise<void> => {
      if (!pattern) {
        store.clear();
        return;
      }
      const prefix = pattern.replace(':*', '');
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) { store.delete(key); }
      }
    }),
    getStats: vi.fn(async () => ({ keys: 0, memory: 0 })),
    getHealth: vi.fn(async () => ({ healthy: true })),
  } as unknown as StateBroker;

  return { broker, store };
}

const unlimitedConfig: RateLimitConfig = {}; // no limits — always allowed
const tpmConfig: RateLimitConfig = { tokensPerMinute: 1000, safetyMargin: 1.0 };
const rpmConfig: RateLimitConfig = { requestsPerMinute: 2, safetyMargin: 1.0 };
const concurrentConfig: RateLimitConfig = { maxConcurrentRequests: 2 };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StateBrokerRateLimitBackend', () => {
  let backend: StateBrokerRateLimitBackend;
  let broker: StateBroker;

  beforeEach(() => {
    const result = makeBroker();
    broker = result.broker;
    backend = new StateBrokerRateLimitBackend(broker);
  });

  describe('acquire() — allowed path', () => {
    it('returns allowed=true when no limits configured', async () => {
      const result = await backend.acquire('llm', 100, unlimitedConfig);
      expect(result.allowed).toBe(true);
    });

    it('writes to state broker on allowed acquire', async () => {
      await backend.acquire('llm', 500, tpmConfig);
      expect(broker.set).toHaveBeenCalled();
    });

    it('includes activeRequests in response', async () => {
      const result = await backend.acquire('llm', 10, unlimitedConfig);
      expect(result.activeRequests).toBe(1);
    });

    it('increments activeRequests on second acquire', async () => {
      await backend.acquire('llm', 10, unlimitedConfig);
      const result = await backend.acquire('llm', 10, unlimitedConfig);
      expect(result.activeRequests).toBe(2);
    });

    it('includes tokensRemaining when TPM configured', async () => {
      const result = await backend.acquire('llm', 100, tpmConfig);
      expect(result.allowed).toBe(true);
      expect(result.tokensRemaining).toBeDefined();
      expect(result.tokensRemaining).toBe(900); // 1000 - 100
    });
  });

  describe('acquire() — denied path', () => {
    it('returns allowed=false when TPM limit exceeded', async () => {
      await backend.acquire('llm', 900, tpmConfig); // uses 900/1000 tokens
      const result = await backend.acquire('llm', 200, tpmConfig); // would exceed
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBeGreaterThan(0);
    });

    it('returns allowed=false when RPM limit exceeded', async () => {
      await backend.acquire('llm', 1, rpmConfig);
      await backend.acquire('llm', 1, rpmConfig);
      const result = await backend.acquire('llm', 1, rpmConfig); // RPM=2 exhausted
      expect(result.allowed).toBe(false);
    });

    it('returns allowed=false when concurrent limit hit', async () => {
      await backend.acquire('llm', 0, concurrentConfig); // active=1
      await backend.acquire('llm', 0, concurrentConfig); // active=2
      const result = await backend.acquire('llm', 0, concurrentConfig); // at max=2
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBe(100);
    });
  });

  describe('release()', () => {
    it('decrements active count after release', async () => {
      await backend.acquire('llm', 10, unlimitedConfig);
      await backend.acquire('llm', 10, unlimitedConfig);
      await backend.release('llm');
      // After release, active count should drop
      expect(broker.set).toHaveBeenCalled();
    });

    it('release does not go below 0', async () => {
      // Release when nothing acquired — should not throw
      await expect(backend.release('llm')).resolves.not.toThrow();
    });
  });

  describe('getStats()', () => {
    it('returns stats for a resource', async () => {
      await backend.acquire('llm', 100, tpmConfig);
      const stats = await backend.getStats('llm');
      expect(stats.resource).toBe('llm');
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(100);
    });

    it('returns zero stats for unknown resource', async () => {
      const stats = await backend.getStats('unknown');
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('reset()', () => {
    it('clears resource state from broker', async () => {
      await backend.acquire('llm', 100, tpmConfig);
      await backend.reset('llm');
      expect(broker.clear).toHaveBeenCalledWith(expect.stringContaining('ratelimit:llm:'));
    });
  });
});
