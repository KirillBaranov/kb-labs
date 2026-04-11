/**
 * @module @kb-labs/rest-api-app/middleware/__tests__/request-id
 *
 * Tests for request ID middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { registerRequestIdMiddleware } from '../request-id';

describe('registerRequestIdMiddleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerRequestIdMiddleware(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('request ID generation', () => {
    it('should generate request ID if not provided', async () => {
      app.get('/test', async () => {
        return { message: 'ok' };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-trace-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
      expect(typeof response.headers['x-trace-id']).toBe('string');
    });

    it('should use provided request ID from header', async () => {
      app.get('/test', async () => {
        return { message: 'ok' };
      });

      await app.ready();

      const customRequestId = 'custom-request-123';
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-request-id': customRequestId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('should use provided trace ID from header', async () => {
      app.get('/test', async () => {
        return { message: 'ok' };
      });

      await app.ready();

      const customTraceId = 'custom-trace-456';
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-trace-id': customTraceId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toBe(customTraceId);
    });
  });

  describe('logger integration', () => {
    it('should attach logger to request object', async () => {
      let requestLogger: any;

      app.get('/test', async (request: FastifyRequest) => {
        requestLogger = (request as any).log;
        return { message: 'ok' };
      });

      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test',
      });

      // Verify request.log is defined and has expected methods
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.debug).toBe('function');
      expect(typeof requestLogger.info).toBe('function');
      expect(typeof requestLogger.warn).toBe('function');
      expect(typeof requestLogger.error).toBe('function');
    });

    it('should attach logger to reply object', async () => {
      let replyLogger: any;

      app.get('/test', async (request: FastifyRequest, reply: FastifyReply) => {
        replyLogger = (reply as any).log;
        return { message: 'ok' };
      });

      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test',
      });

      // Verify reply.log is defined and has expected methods
      expect(replyLogger).toBeDefined();
      expect(typeof replyLogger.debug).toBe('function');
      expect(typeof replyLogger.info).toBe('function');
      expect(typeof replyLogger.warn).toBe('function');
      expect(typeof replyLogger.error).toBe('function');
    });

    it('should allow calling logger methods without errors', async () => {
      let requestLogger: any;

      app.get('/test', async (request: FastifyRequest) => {
        requestLogger = (request as any).log;

        // Call all logger methods to ensure they work
        requestLogger.debug('Debug message', { foo: 'bar' });
        requestLogger.info('Info message', { baz: 'qux' });
        requestLogger.warn('Warning message');
        requestLogger.error('Error message');

        return { message: 'ok' };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      // If we got here without errors, logger methods work correctly
      expect(requestLogger).toBeDefined();
    });
  });
});
