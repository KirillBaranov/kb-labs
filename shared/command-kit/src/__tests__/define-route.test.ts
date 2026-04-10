/**
 * @file Unit tests for defineRoute
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineRoute, isRESTHost } from '../define-route.js';
import type { PluginContextV3, RestHostContext } from '@kb-labs/plugin-contracts';

describe('defineRoute', () => {
  let mockContext: PluginContextV3<unknown>;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const restHostContext: RestHostContext = {
      host: 'rest',
      path: '/api/test',
      method: 'POST',
      headers: {},
      requestId: 'req-123',
      traceId: 'trace-123',
    };

    mockContext = {
      host: 'rest',
      hostContext: restHostContext,
      ui: {} as any,
      platform: {} as any,
      config: {},
    } as any;
  });

  describe('host validation', () => {
    it('should throw error if host is not rest', async () => {
      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
        },
      });

      const invalidContext = {
        ...mockContext,
        host: 'cli' as const,
        hostContext: { host: 'cli' as const } as any,
      };

      await expect(
        handler.execute(invalidContext, {})
      ).rejects.toThrow('can only run in REST host');
    });

    it('should throw error if HTTP method mismatch', async () => {
      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
        },
      });

      const wrongMethodContext = {
        ...mockContext,
        hostContext: {
          ...mockContext.hostContext,
          method: 'GET',
        } as RestHostContext,
      };

      await expect(
        handler.execute(wrongMethodContext, {})
      ).rejects.toThrow('expects POST but got GET');
    });

    it('should be case-insensitive for HTTP methods', async () => {
      const handler = defineRoute({
        path: '/api/test',
        method: 'post',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
        },
      });

      const upperCaseContext = {
        ...mockContext,
        hostContext: {
          ...mockContext.hostContext,
          method: 'POST',
        } as RestHostContext,
      };

      await expect(
        handler.execute(upperCaseContext, {})
      ).resolves.toBeDefined();
    });

    it('should accept valid REST host context', async () => {
      const execute = vi.fn(async () => ({ data: {}, exitCode: 0 }));

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: { execute },
      });

      await handler.execute(mockContext, {});

      expect(execute).toHaveBeenCalled();
    });
  });

  describe('handler execution', () => {
    it('should call execute with context and input', async () => {
      const execute = vi.fn(async (ctx, input) => ({ data: { received: input }, exitCode: 0 }));

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: { execute },
      });

      const input = { name: 'test' };
      await handler.execute(mockContext, input);

      expect(execute).toHaveBeenCalledWith(mockContext, input);
    });

    it('should return handler result', async () => {
      const expectedResult = { data: { message: 'success' }, exitCode: 0 };

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            return expectedResult;
          },
        },
      });

      const result = await handler.execute(mockContext, {});

      expect(result).toEqual(expectedResult);
    });

    it('should handle void return from handler', async () => {
      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            // void return
          },
        },
      });

      const result = await handler.execute(mockContext, {});

      expect(result).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should call cleanup after successful execution', async () => {
      const cleanup = vi.fn();

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
          cleanup,
        },
      });

      await handler.execute(mockContext, {});

      expect(cleanup).toHaveBeenCalled();
    });

    it('should call cleanup even if handler throws', async () => {
      const cleanup = vi.fn();

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            throw new Error('Handler error');
          },
          cleanup,
        },
      });

      await expect(handler.execute(mockContext, {})).rejects.toThrow('Handler error');

      expect(cleanup).toHaveBeenCalled();
    });

    it('should not call cleanup if validation fails', async () => {
      const cleanup = vi.fn();
      const execute = vi.fn();

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          execute,
          cleanup,
        },
      });

      const invalidContext = {
        ...mockContext,
        host: 'cli' as const,
        hostContext: { host: 'cli' as const } as any,
      };

      await expect(handler.execute(invalidContext, {})).rejects.toThrow();

      expect(cleanup).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('should propagate handler error after cleanup', async () => {
      const cleanup = vi.fn();
      const error = new Error('Handler error');

      const handler = defineRoute({
        path: '/api/test',
        method: 'POST',
        handler: {
          async execute() {
            throw error;
          },
          cleanup,
        },
      });

      await expect(handler.execute(mockContext, {})).rejects.toThrow(error);

      expect(cleanup).toHaveBeenCalled();
    });
  });
});

describe('isRESTHost', () => {
  it('should return true for REST host context', () => {
    const restContext: RestHostContext = {
      host: 'rest',
      path: '/api/test',
      method: 'POST',
      headers: {},
      requestId: 'req-123',
      traceId: 'trace-123',
    };

    expect(isRESTHost(restContext)).toBe(true);
  });

  it('should return false for non-REST host context', () => {
    const cliContext = {
      host: 'cli' as const,
      argv: [],
      flags: {},
    };

    expect(isRESTHost(cliContext)).toBe(false);
  });
});
