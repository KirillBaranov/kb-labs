/**
 * @module @kb-labs/rest-api-app/middleware/__tests__/cache
 *
 * Tests for cache middleware (ETag/Last-Modified support).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

import { generateETag, registerCacheMiddleware } from '../cache';

describe('generateETag', () => {
  it('should generate consistent ETag for same string content', () => {
    const content = 'Hello, World!';
    const etag1 = generateETag(content);
    const etag2 = generateETag(content);

    expect(etag1).toBe(etag2);
    expect(etag1).toMatch(/^"[a-f0-9]{16}"$/);
  });

  it('should generate different ETags for different content', () => {
    const etag1 = generateETag('Hello');
    const etag2 = generateETag('World');

    expect(etag1).not.toBe(etag2);
  });

  it('should handle object content by stringifying', () => {
    const obj = { foo: 'bar', num: 42 };
    const etag = generateETag(obj);

    expect(etag).toMatch(/^"[a-f0-9]{16}"$/);

    // Same object should produce same ETag
    const etag2 = generateETag({ foo: 'bar', num: 42 });
    expect(etag).toBe(etag2);
  });

  it('should handle Buffer content', () => {
    const buffer = Buffer.from('Hello, Buffer!');
    const etag = generateETag(buffer);

    expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
  });

  it('should handle empty string', () => {
    const etag = generateETag('');
    expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
  });

  it('should handle empty object', () => {
    const etag = generateETag({});
    expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
  });
});

describe('registerCacheMiddleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerCacheMiddleware(app);

    // Add test route
    app.get('/test', async () => {
      return { message: 'Hello, World!' };
    });

    app.post('/test', async () => {
      return { created: true };
    });

    await app.ready();
  });

  describe('ETag handling', () => {
    it('should add ETag header to GET responses when If-None-Match is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-none-match': '"invalid-etag"' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toMatch(/^"[a-f0-9]{16}"$/);
    });

    it('should return 304 when ETag matches', async () => {
      // First request to get the ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-none-match': '"dummy"' },
      });

      const etag = firstResponse.headers.etag as string;
      expect(etag).toBeDefined();

      // Second request with matching ETag
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-none-match': etag },
      });

      expect(secondResponse.statusCode).toBe(304);
      // Note: Fastify inject may still include body in response object,
      // but HTTP clients won't receive body content for 304 responses
    });

    it('should return 304 when weak ETag matches', async () => {
      // First request to get the ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-none-match': '"dummy"' },
      });

      const etag = firstResponse.headers.etag as string;

      // Second request with weak ETag
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-none-match': `W/${etag}` },
      });

      expect(secondResponse.statusCode).toBe(304);
    });

    it('should not add ETag to POST requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        headers: { 'if-none-match': '"some-etag"' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBeUndefined();
    });
  });

  describe('Last-Modified handling', () => {
    it('should add Last-Modified header when If-Modified-Since is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'if-modified-since': 'Wed, 01 Jan 2020 00:00:00 GMT' },
      });

      expect(response.headers['last-modified']).toBeDefined();
    });
  });

  describe('streaming responses', () => {
    it('should skip cache for SSE responses', async () => {
      const sseApp = Fastify({ logger: false });
      registerCacheMiddleware(sseApp as any);

      sseApp.get('/events', async (request, reply) => {
        reply.header('content-type', 'text/event-stream');
        return 'data: test\n\n';
      });

      await sseApp.ready();

      const response = await sseApp.inject({
        method: 'GET',
        url: '/events',
        headers: { 'if-none-match': '"some-etag"' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBeUndefined();

      await sseApp.close();
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
