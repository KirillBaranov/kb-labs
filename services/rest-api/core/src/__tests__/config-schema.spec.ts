/**
 * @module @kb-labs/rest-api-core/__tests__/config-schema
 *
 * Tests for REST API configuration schema validation.
 */

import { describe, it, expect } from 'vitest';
import { restApiConfigSchema, type RestApiConfig } from '../config/schema';

describe('restApiConfigSchema', () => {
  describe('defaults', () => {
    it('should provide all defaults for empty object', () => {
      const result = restApiConfigSchema.parse({});

      expect(result.port).toBe(5050);
      expect(result.basePath).toBe('/api/v1');
      expect(result.apiVersion).toBe('1.0.0');
      expect(result.mockMode).toBe(false);
      expect(result.plugins).toEqual([]);
    });

    it('should provide cors defaults', () => {
      const result = restApiConfigSchema.parse({});

      expect(result.cors.origins).toEqual(['http://localhost:3000', 'http://localhost:5173']);
      expect(result.cors.allowCredentials).toBe(true);
      expect(result.cors.profile).toBe('dev');
    });
  });

  describe('port validation', () => {
    it('should accept valid port numbers', () => {
      expect(restApiConfigSchema.parse({ port: 3000 }).port).toBe(3000);
      expect(restApiConfigSchema.parse({ port: 8080 }).port).toBe(8080);
      expect(restApiConfigSchema.parse({ port: 65535 }).port).toBe(65535);
    });

    it('should reject invalid port numbers', () => {
      expect(() => restApiConfigSchema.parse({ port: 0 })).toThrow();
      expect(() => restApiConfigSchema.parse({ port: -1 })).toThrow();
      expect(() => restApiConfigSchema.parse({ port: 1.5 })).toThrow();
      expect(() => restApiConfigSchema.parse({ port: 'abc' })).toThrow();
    });
  });

  describe('cors validation', () => {
    it('should accept valid cors profiles', () => {
      expect(restApiConfigSchema.parse({ cors: { profile: 'dev' } }).cors.profile).toBe('dev');
      expect(restApiConfigSchema.parse({ cors: { profile: 'preview' } }).cors.profile).toBe('preview');
      expect(restApiConfigSchema.parse({ cors: { profile: 'prod' } }).cors.profile).toBe('prod');
    });

    it('should reject invalid cors profile', () => {
      expect(() => restApiConfigSchema.parse({ cors: { profile: 'invalid' } })).toThrow();
    });

    it('should accept array of origins', () => {
      const result = restApiConfigSchema.parse({
        cors: { origins: ['https://example.com', 'https://app.example.com'] },
      });
      expect(result.cors.origins).toEqual(['https://example.com', 'https://app.example.com']);
    });
  });

  describe('timeouts validation', () => {
    it('should accept valid timeout values', () => {
      const result = restApiConfigSchema.parse({
        timeouts: {
          requestTimeout: 60000,
          bodyLimit: 52428800,
        },
      });

      expect(result.timeouts?.requestTimeout).toBe(60000);
      expect(result.timeouts?.bodyLimit).toBe(52428800);
    });

    it('should reject negative timeout values', () => {
      expect(() =>
        restApiConfigSchema.parse({
          timeouts: { requestTimeout: -1, bodyLimit: 1024 },
        })
      ).toThrow();
    });
  });

  describe('rateLimit validation', () => {
    it('should accept valid rate limit config', () => {
      const result = restApiConfigSchema.parse({
        rateLimit: {
          max: 100,
          timeWindow: '5 minutes',
        },
      });

      expect(result.rateLimit?.max).toBe(100);
      expect(result.rateLimit?.timeWindow).toBe('5 minutes');
    });

    it('should reject non-positive max value', () => {
      expect(() =>
        restApiConfigSchema.parse({
          rateLimit: { max: 0, timeWindow: '1 minute' },
        })
      ).toThrow();
    });
  });

  describe('redis validation', () => {
    it('should accept valid redis config', () => {
      const result = restApiConfigSchema.parse({
        redis: {
          url: 'redis://localhost:6379',
          namespace: 'myapp',
        },
      });

      expect(result.redis?.url).toBe('redis://localhost:6379');
      expect(result.redis?.namespace).toBe('myapp');
    });

    it('should provide default namespace for redis', () => {
      const result = restApiConfigSchema.parse({
        redis: {
          url: 'redis://localhost:6379',
        },
      });

      expect(result.redis?.namespace).toBe('kb');
    });

    it('should reject empty redis url', () => {
      expect(() =>
        restApiConfigSchema.parse({
          redis: { url: '' },
        })
      ).toThrow();
    });

    it('should allow config without redis', () => {
      const result = restApiConfigSchema.parse({});
      expect(result.redis).toBeUndefined();
    });
  });

  describe('startup validation', () => {
    it('should accept valid startup config', () => {
      const result = restApiConfigSchema.parse({
        startup: {
          maxConcurrent: 16,
          queueLimit: 64,
          timeoutMs: 10000,
          retryAfterSeconds: 5,
        },
      });

      expect(result.startup?.maxConcurrent).toBe(16);
      expect(result.startup?.queueLimit).toBe(64);
      expect(result.startup?.timeoutMs).toBe(10000);
      expect(result.startup?.retryAfterSeconds).toBe(5);
    });

    it('should allow queueLimit of zero', () => {
      const result = restApiConfigSchema.parse({
        startup: {
          maxConcurrent: 1,
          queueLimit: 0,
          timeoutMs: 1000,
          retryAfterSeconds: 1,
        },
      });

      expect(result.startup?.queueLimit).toBe(0);
    });
  });

  describe('events validation', () => {
    it('should accept valid events config with registry token', () => {
      const result = restApiConfigSchema.parse({
        events: {
          registry: {
            token: 'secret-token-123',
            headerName: 'x-api-key',
            queryParam: 'token',
          },
        },
      });

      expect(result.events?.registry?.token).toBe('secret-token-123');
      expect(result.events?.registry?.headerName).toBe('x-api-key');
      expect(result.events?.registry?.queryParam).toBe('token');
    });

    it('should provide defaults for registry header and query param', () => {
      const result = restApiConfigSchema.parse({
        events: {
          registry: {
            token: 'my-token',
          },
        },
      });

      expect(result.events?.registry?.headerName).toBe('authorization');
      expect(result.events?.registry?.queryParam).toBe('access_token');
    });

    it('should reject empty registry token', () => {
      expect(() =>
        restApiConfigSchema.parse({
          events: {
            registry: { token: '' },
          },
        })
      ).toThrow();
    });
  });

  describe('plugins array', () => {
    it('should accept array of plugin strings', () => {
      const result = restApiConfigSchema.parse({
        plugins: ['@kb-labs/mind', '@kb-labs/release'],
      });

      expect(result.plugins).toEqual(['@kb-labs/mind', '@kb-labs/release']);
    });

    it('should accept empty plugins array', () => {
      const result = restApiConfigSchema.parse({ plugins: [] });
      expect(result.plugins).toEqual([]);
    });
  });

  describe('mockMode', () => {
    it('should accept boolean mockMode', () => {
      expect(restApiConfigSchema.parse({ mockMode: true }).mockMode).toBe(true);
      expect(restApiConfigSchema.parse({ mockMode: false }).mockMode).toBe(false);
    });

    it('should default to false', () => {
      expect(restApiConfigSchema.parse({}).mockMode).toBe(false);
    });
  });

  describe('full config', () => {
    it('should accept complete valid config', () => {
      const fullConfig: RestApiConfig = {
        port: 8080,
        basePath: '/v2',
        apiVersion: '2.0.0',
        cors: {
          origins: ['https://app.example.com'],
          allowCredentials: false,
          profile: 'prod',
        },
        timeouts: {
          requestTimeout: 60000,
          bodyLimit: 52428800,
        },
        rateLimit: {
          max: 1000,
          timeWindow: '1 hour',
        },
        startup: {
          maxConcurrent: 64,
          queueLimit: 256,
          timeoutMs: 10000,
          retryAfterSeconds: 3,
        },
        plugins: ['@kb-labs/mind'],
        mockMode: false,
        redis: {
          url: 'redis://localhost:6379',
          namespace: 'prod',
        },
        events: {
          registry: {
            token: 'prod-token',
            headerName: 'authorization',
            queryParam: 'access_token',
          },
        },
      };

      const result = restApiConfigSchema.parse(fullConfig);

      expect(result.port).toBe(8080);
      expect(result.basePath).toBe('/v2');
      expect(result.apiVersion).toBe('2.0.0');
      expect(result.cors.profile).toBe('prod');
      expect(result.redis?.url).toBe('redis://localhost:6379');
    });
  });
});
