/**
 * @module @kb-labs/rest-api-app/middleware/__tests__/rate-limit
 *
 * Tests for tenant-aware rate limiting middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';

import { extractTenantId, createRateLimitMiddleware } from '../rate-limit';

interface TenantRateLimiter {
  checkLimit(tenantId: string, resource: string): Promise<RateLimitResult>;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

describe('extractTenantId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.KB_TENANT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should extract tenant ID from X-Tenant-ID header', () => {
    const request = {
      headers: { 'x-tenant-id': 'acme-corp' },
    } as any;

    expect(extractTenantId(request)).toBe('acme-corp');
  });

  it('should fall back to KB_TENANT_ID env var when header is missing', () => {
    process.env.KB_TENANT_ID = 'env-tenant';

    const request = {
      headers: {},
    } as any;

    expect(extractTenantId(request)).toBe('env-tenant');
  });

  it('should use default when no header and no env var', () => {
    const request = {
      headers: {},
    } as any;

    expect(extractTenantId(request)).toBe('default');
  });

  it('should prefer header over env var', () => {
    process.env.KB_TENANT_ID = 'env-tenant';

    const request = {
      headers: { 'x-tenant-id': 'header-tenant' },
    } as any;

    expect(extractTenantId(request)).toBe('header-tenant');
  });
});

describe('createRateLimitMiddleware', () => {
  let app: ReturnType<typeof Fastify>;
  let mockRateLimiter: TenantRateLimiter;

  const createMockRateLimiter = (overrides: Partial<RateLimitResult> = {}): TenantRateLimiter => {
    const defaultResult: RateLimitResult = {
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: Date.now() + 60000,
      ...overrides,
    };

    return {
      checkLimit: vi.fn().mockResolvedValue(defaultResult),
    } as any;
  };

  beforeEach(async () => {
    mockRateLimiter = createMockRateLimiter();
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('allowed requests', () => {
    it('should allow request and add rate limit headers', async () => {
      mockRateLimiter = createMockRateLimiter({
        allowed: true,
        limit: 100,
        remaining: 95,
        resetAt: Date.now() + 60000,
      });

      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-tenant-id': 'test-tenant' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBe('95');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('test-tenant', 'requests');
    });

    it('should store tenantId in request context', async () => {
      let capturedTenantId: string | undefined;

      mockRateLimiter = createMockRateLimiter({ allowed: true });
      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async (request: FastifyRequest) => {
        capturedTenantId = (request as any).tenantId;
        return { tenantId: capturedTenantId };
      });

      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-tenant-id': 'captured-tenant' },
      });

      expect(capturedTenantId).toBe('captured-tenant');
    });
  });

  describe('rate limited requests', () => {
    it('should return 429 when rate limit exceeded', async () => {
      const resetAt = Date.now() + 30000; // 30 seconds from now

      mockRateLimiter = createMockRateLimiter({
        allowed: false,
        limit: 100,
        remaining: 0,
        resetAt,
      });

      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-tenant-id': 'limited-tenant' },
      });

      expect(response.statusCode).toBe(429);

      const body = response.json();
      expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.message).toBe('Too many requests. Please try again later.');
      expect(body.retryAfter).toBeDefined();
      expect(body.limit).toBe(100);
      expect(body.resetAt).toBeDefined();
    });

    it('should include Retry-After header when rate limited', async () => {
      const resetAt = Date.now() + 45000; // 45 seconds from now

      mockRateLimiter = createMockRateLimiter({
        allowed: false,
        resetAt,
      });

      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();

      const retryAfter = parseInt(response.headers['retry-after'] as string, 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(45);
    });

    it('should still include rate limit headers when limited', async () => {
      mockRateLimiter = createMockRateLimiter({
        allowed: false,
        limit: 50,
        remaining: 0,
        resetAt: Date.now() + 60000,
      });

      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.headers['x-ratelimit-limit']).toBe('50');
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('tenant isolation', () => {
    it('should check rate limit for each tenant separately', async () => {
      mockRateLimiter = createMockRateLimiter({ allowed: true });
      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      // First tenant
      await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-tenant-id': 'tenant-a' },
      });

      // Second tenant
      await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-tenant-id': 'tenant-b' },
      });

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledTimes(2);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-a', 'requests');
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-b', 'requests');
    });
  });

  describe('default tenant', () => {
    it('should use default tenant when no header provided', async () => {
      mockRateLimiter = createMockRateLimiter({ allowed: true });
      const middleware = createRateLimitMiddleware(mockRateLimiter);
      app.addHook('preHandler', middleware);

      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('default', 'requests');
    });
  });
});
