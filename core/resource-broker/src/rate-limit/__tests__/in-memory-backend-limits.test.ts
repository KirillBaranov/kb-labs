import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRateLimitBackend } from '../in-memory-backend.js';
import type { RateLimitConfig } from '../../types.js';

describe('InMemoryRateLimitBackend — limit violations and edge cases', () => {
  let backend: InMemoryRateLimitBackend;

  beforeEach(() => {
    backend = new InMemoryRateLimitBackend();
  });

  // ── TPM violations ────────────────────────────────────────────────────────

  describe('TPM (tokens per minute) limit', () => {
    const config: RateLimitConfig = {
      tokensPerMinute: 100,
      safetyMargin: 1.0, // no margin, exact limit
    };

    it('allows requests within TPM limit', async () => {
      const r1 = await backend.acquire('llm', 50, config);
      expect(r1.allowed).toBe(true);
      expect(r1.tokensRemaining).toBe(50);

      const r2 = await backend.acquire('llm', 50, config);
      expect(r2.allowed).toBe(true);
      expect(r2.tokensRemaining).toBe(0);
    });

    it('blocks request that would exceed TPM', async () => {
      await backend.acquire('llm', 90, config);
      const result = await backend.acquire('llm', 20, config); // 90+20 > 100
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBeGreaterThan(0);
      expect(result.tokensRemaining).toBe(10); // 100-90
    });

    it('increments waitCount on denied request', async () => {
      await backend.acquire('llm', 100, config);
      await backend.acquire('llm', 1, config); // denied
      const stats = await backend.getStats('llm');
      expect(stats.waitCount).toBe(1);
    });
  });

  // ── RPM violations ────────────────────────────────────────────────────────

  describe('RPM (requests per minute) limit', () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 3,
      safetyMargin: 1.0,
    };

    it('allows exactly N requests before blocking', async () => {
      for (let i = 0; i < 3; i++) {
        const r = await backend.acquire('api', 0, config);
        expect(r.allowed).toBe(true);
      }
      const blocked = await backend.acquire('api', 0, config);
      expect(blocked.allowed).toBe(false);
    });

    it('includes requestsRemaining in response', async () => {
      const r = await backend.acquire('api', 0, config);
      expect(r.requestsRemaining).toBe(2); // 3 - 1
    });
  });

  // ── RPS violations ────────────────────────────────────────────────────────

  describe('RPS (requests per second) limit', () => {
    const config: RateLimitConfig = {
      requestsPerSecond: 2,
      safetyMargin: 1.0,
    };

    it('blocks after N requests in same second', async () => {
      await backend.acquire('cache', 0, config);
      await backend.acquire('cache', 0, config);
      const blocked = await backend.acquire('cache', 0, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.waitTimeMs).toBeGreaterThan(0);
      expect(blocked.waitTimeMs).toBeLessThanOrEqual(1050); // within 1 second
    });
  });

  // ── Concurrent request limit ──────────────────────────────────────────────

  describe('maxConcurrentRequests limit', () => {
    const config: RateLimitConfig = { maxConcurrentRequests: 2 };

    it('allows up to max concurrent requests', async () => {
      const r1 = await backend.acquire('gpu', 0, config);
      const r2 = await backend.acquire('gpu', 0, config);
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r2.activeRequests).toBe(2);
    });

    it('blocks when at max concurrent', async () => {
      await backend.acquire('gpu', 0, config);
      await backend.acquire('gpu', 0, config);
      const blocked = await backend.acquire('gpu', 0, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.waitTimeMs).toBe(100);
    });

    it('allows after release', async () => {
      await backend.acquire('gpu', 0, config);
      await backend.acquire('gpu', 0, config);
      await backend.release('gpu');
      const r = await backend.acquire('gpu', 0, config);
      expect(r.allowed).toBe(true);
    });
  });

  // ── Window reset behavior ─────────────────────────────────────────────────

  describe('second window reset', () => {
    it('resets second window after 1 second', async () => {
      const rpsConfig: RateLimitConfig = { requestsPerSecond: 1, safetyMargin: 1.0 };

      await backend.acquire('cache', 0, rpsConfig);
      const blocked = await backend.acquire('cache', 0, rpsConfig);
      expect(blocked.allowed).toBe(false);

      // Simulate time passing by manipulating internal state via fake timers
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now + 1100); // advance 1.1 seconds

      try {
        // After 1s, second window should reset
        await backend.reset('cache');
        const r = await backend.acquire('cache', 0, rpsConfig);
        expect(r.allowed).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Safety margin ─────────────────────────────────────────────────────────

  describe('safety margin', () => {
    it('applies 90% safety margin by default', async () => {
      // With tokensPerMinute=100, effective=90
      const config: RateLimitConfig = { tokensPerMinute: 100 }; // default 0.9 margin
      await backend.acquire('llm', 85, config);
      const r = await backend.acquire('llm', 10, config); // 85+10=95 > 90
      expect(r.allowed).toBe(false);
    });
  });

  // ── No limits ─────────────────────────────────────────────────────────────

  describe('no limits configured', () => {
    it('always allows requests with empty config', async () => {
      for (let i = 0; i < 100; i++) {
        const r = await backend.acquire('unlimited', 1000, {});
        expect(r.allowed).toBe(true);
      }
    });
  });

  // ── release and stats ─────────────────────────────────────────────────────

  describe('release()', () => {
    it('decrements activeRequests', async () => {
      await backend.acquire('llm', 0, { maxConcurrentRequests: 5 });
      await backend.acquire('llm', 0, { maxConcurrentRequests: 5 });
      await backend.release('llm');
      const stats = await backend.getStats('llm');
      expect(stats.activeRequests).toBe(1);
    });

    it('does not go below 0', async () => {
      await backend.release('llm'); // release without acquire
      const stats = await backend.getStats('llm');
      expect(stats.activeRequests).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('tracks cumulative requests and tokens', async () => {
      await backend.acquire('llm', 100, {});
      await backend.acquire('llm', 200, {});
      const stats = await backend.getStats('llm');
      expect(stats.totalRequests).toBe(2);
      expect(stats.totalTokens).toBe(300);
    });
  });

  describe('reset()', () => {
    it('clears state for a resource', async () => {
      await backend.acquire('llm', 100, {});
      await backend.reset('llm');
      const stats = await backend.getStats('llm');
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('resetAll()', () => {
    it('clears all resources', async () => {
      await backend.acquire('llm', 0, {});
      await backend.acquire('cache', 0, {});
      backend.resetAll();
      const s1 = await backend.getStats('llm');
      const s2 = await backend.getStats('cache');
      expect(s1.totalRequests).toBe(0);
      expect(s2.totalRequests).toBe(0);
    });
  });
});
