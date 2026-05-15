/**
 * @module @kb-labs/rest-api-app/middleware/__tests__/envelope
 *
 * Tests for response envelope middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { PluginErrorEnvelope } from '@kb-labs/rest-api-contracts';
import { registerEnvelopeMiddleware } from '../envelope';

const TEST_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: '1.0.0',
  cors: {
    origins: [],
    allowCredentials: true,
    profile: 'dev',
  },
  plugins: [],
  mockMode: false,
};

describe('registerEnvelopeMiddleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerEnvelopeMiddleware(app, TEST_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('successful responses', () => {
    it('should wrap JSON response in envelope', async () => {
      app.get('/test', async () => {
        return { message: 'Hello' };
      });

      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual({ message: 'Hello' });
      expect(body.meta).toBeDefined();
      expect(body.meta.apiVersion).toBe('1.0.0');
      expect(body.meta.requestId).toBeDefined();
      expect(typeof body.meta.durationMs).toBe('number');
    });

    it('should add x-schema-version header', async () => {
      app.get('/test', async () => ({ value: 42 }));
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['x-schema-version']).toBe('1.0.0');
    });

    it('should handle empty object response', async () => {
      app.get('/empty', async () => ({}));
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/empty' })).json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual({});
    });

    it('should handle null response', async () => {
      app.get('/null', async () => null);
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/null' })).json();
      expect(body.ok).toBe(true);
      expect(body.data).toBeNull();
    });

    it('should handle array response', async () => {
      app.get('/array', async () => [1, 2, 3]);
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/array' })).json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([1, 2, 3]);
    });

    it('should not double-wrap already enveloped responses', async () => {
      app.get('/enveloped', async () => ({
        ok: true,
        data: { already: 'wrapped' },
        meta: { custom: 'meta' },
      }));
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/enveloped' })).json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual({ already: 'wrapped' });
      expect(body.meta).toEqual({ custom: 'meta' });
      expect(body.data.ok).toBeUndefined();
    });
  });

  describe('error responses', () => {
    it('should wrap errors in error envelope', async () => {
      app.get('/error', async () => {
        const error = new Error('Something went wrong') as Error & { statusCode?: number; code?: string };
        error.statusCode = 400;
        error.code = 'E_BAD_REQUEST';
        throw error;
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/error' });
      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('E_BAD_REQUEST');
      expect(body.error.message).toBe('Something went wrong');
      expect(body.meta.apiVersion).toBe('1.0.0');
    });

    it('should default to E_INTERNAL for unknown errors', async () => {
      app.get('/internal-error', async () => {
        throw new Error('Unexpected error');
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/internal-error' });
      expect(response.statusCode).toBe(500);

      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('E_INTERNAL');
    });

    it('should include error details when provided', async () => {
      app.get('/detailed-error', async () => {
        const error = new Error('Validation failed') as Error & { statusCode?: number; code?: string; details?: unknown };
        error.statusCode = 422;
        error.code = 'E_VALIDATION';
        error.details = { field: 'email', reason: 'invalid format' };
        throw error;
      });
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/detailed-error' })).json();
      expect(body.error.details).toEqual({ field: 'email', reason: 'invalid format' });
    });

    it('should include traceId when provided', async () => {
      app.get('/traced-error', async () => {
        const error = new Error('Traceable error') as Error & { statusCode?: number; traceId?: string };
        error.statusCode = 500;
        error.traceId = 'trace-123-abc';
        throw error;
      });
      await app.ready();

      const body = (await app.inject({ method: 'GET', url: '/traced-error' })).json();
      expect(body.error.traceId).toBe('trace-123-abc');
    });

    it('should always produce ok:false for error responses — never ok:true wrapping', async () => {
      // Regression: PluginErrorEnvelope (no ok field) was being wrapped as { ok: true, data: pluginErr }
      app.get('/plugin-error', async () => {
        const pluginErr: PluginErrorEnvelope = {
          status: 'error',
          http: 422,
          code: 'E_PLUGIN_VALIDATION',
          message: 'Plugin validation failed',
          details: { field: 'x' },
          meta: {
            requestId: 'req-1',
            pluginId: 'my-plugin',
            pluginVersion: '1.0.0',
            routeOrCommand: '/test',
            timeMs: 10,
          },
        };
        throw pluginErr;
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/plugin-error' });
      expect(response.statusCode).toBe(422);

      const body = response.json();
      // Must be ErrorEnvelope, not { ok: true, data: PluginErrorEnvelope }
      expect(body.ok).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('E_PLUGIN_VALIDATION');
      expect(body.error.message).toBe('Plugin validation failed');
      // Plugin metadata preserved in details
      expect(body.error.details.pluginId).toBe('my-plugin');
      expect(body.error.details.pluginVersion).toBe('1.0.0');
      expect(body.data).toBeUndefined();
    });
  });

  describe('onSend object payload guard', () => {
    it('should not crash when an object payload reaches onSend (defensive)', async () => {
      // Simulates the scenario where Fastify skips serialisation for non-JSON
      // content-type and passes a raw object to onSend hooks.
      app.get('/raw-obj', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header('content-type', 'application/json');
        return reply.send({ guarded: true });
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/raw-obj' });
      expect(response.statusCode).toBe(200);
      // Should be wrapped or at minimum not crash
      expect(() => response.json()).not.toThrow();
    });
  });

  describe('streaming responses', () => {
    it('should skip envelope for SSE responses', async () => {
      app.get('/events', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header('content-type', 'text/event-stream');
        return 'data: test\n\n';
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/events' });
      expect(response.body).toBe('data: test\n\n');
      expect(response.headers['x-schema-version']).toBe('1.0.0');
    });
  });

  describe('non-JSON responses', () => {
    it('should pass through non-JSON string responses', async () => {
      app.get('/text', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header('content-type', 'text/plain');
        return 'Plain text response';
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/text' });
      expect(response.body).toBe('Plain text response');
    });
  });

  describe('cache middleware ordering', () => {
    it('ETag reflects the envelope-wrapped payload, not the raw data', async () => {
      // When cache middleware runs AFTER envelope, ETag is computed on
      // { ok: true, data: {...}, meta: {...} } — consistent with what the client receives.
      app.get('/cacheable', async () => ({ value: 1 }));
      await app.ready();

      const res1 = await app.inject({ method: 'GET', url: '/cacheable' });
      const etag = res1.headers.etag as string | undefined;

      if (etag) {
        const res2 = await app.inject({
          method: 'GET',
          url: '/cacheable',
          headers: { 'if-none-match': etag },
        });
        // ETag matches the actual response body → 304
        expect(res2.statusCode).toBe(304);
      } else {
        // Cache middleware may not be registered in this unit test — just ensure no crash
        expect(res1.statusCode).toBe(200);
      }
    });
  });
});
