/**
 * @module @kb-labs/rest-api-app/middleware/__tests__/envelope
 *
 * Tests for response envelope middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
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

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

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

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.headers['x-schema-version']).toBe('1.0.0');
    });

    it('should handle empty object response', async () => {
      app.get('/empty', async () => ({}));

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/empty',
      });

      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual({});
    });

    it('should handle null response', async () => {
      app.get('/null', async () => null);

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/null',
      });

      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data).toBeNull();
    });

    it('should handle array response', async () => {
      app.get('/array', async () => [1, 2, 3]);

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/array',
      });

      const body = response.json();
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

      const response = await app.inject({
        method: 'GET',
        url: '/enveloped',
      });

      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual({ already: 'wrapped' });
      expect(body.meta).toEqual({ custom: 'meta' });
      // Should not have nested 'ok' in data
      expect(body.data.ok).toBeUndefined();
    });
  });

  describe('error responses', () => {
    it('should wrap errors in error envelope', async () => {
      app.get('/error', async () => {
        const error = new Error('Something went wrong') as any;
        error.statusCode = 400;
        error.code = 'E_BAD_REQUEST';
        throw error;
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/error',
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('E_BAD_REQUEST');
      expect(body.error.message).toBe('Something went wrong');
      expect(body.meta).toBeDefined();
      expect(body.meta.apiVersion).toBe('1.0.0');
    });

    it('should default to E_INTERNAL for unknown errors', async () => {
      app.get('/internal-error', async () => {
        throw new Error('Unexpected error');
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/internal-error',
      });

      expect(response.statusCode).toBe(500);

      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('E_INTERNAL');
    });

    it('should include error details when provided', async () => {
      app.get('/detailed-error', async () => {
        const error = new Error('Validation failed') as any;
        error.statusCode = 422;
        error.code = 'E_VALIDATION';
        error.details = { field: 'email', reason: 'invalid format' };
        throw error;
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/detailed-error',
      });

      const body = response.json();
      expect(body.error.details).toEqual({ field: 'email', reason: 'invalid format' });
    });

    it('should include traceId when provided', async () => {
      app.get('/traced-error', async () => {
        const error = new Error('Traceable error') as any;
        error.statusCode = 500;
        error.traceId = 'trace-123-abc';
        throw error;
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/traced-error',
      });

      const body = response.json();
      expect(body.error.traceId).toBe('trace-123-abc');
    });
  });

  describe('streaming responses', () => {
    it('should skip envelope for SSE responses', async () => {
      app.get('/events', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.header('content-type', 'text/event-stream');
        return 'data: test\n\n';
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/events',
      });

      // Should return raw SSE data, not wrapped
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

      const response = await app.inject({
        method: 'GET',
        url: '/text',
      });

      // Plain text should be wrapped if it can be parsed
      // but since 'Plain text response' is not valid JSON, it passes through
      expect(response.body).toBe('Plain text response');
    });
  });
});
