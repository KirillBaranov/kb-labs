/**
 * @module @kb-labs/core-runtime/__tests__/cache-proxy-new-methods
 *
 * Unit tests for CacheProxy - all ICache methods:
 * - Basic operations: get, set, delete, clear
 * - Sorted sets: zadd, zrangebyscore, zrem
 * - Atomic operations: setIfNotExists
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheProxy } from '../proxy/cache-proxy.js';
import type { ITransport } from '@kb-labs/core-ipc';
import type { AdapterResponse } from '@kb-labs/core-platform/serializable';
import { serialize } from '@kb-labs/core-platform/serializable';

// Helper to create mock response
function mockResponse<T>(result: T): AdapterResponse {
  return {
    type: 'adapter:response',
    requestId: 'test-123',
    result: result === undefined ? undefined : serialize(result),
  };
}

function mockErrorResponse(error: Error): AdapterResponse {
  return {
    type: 'adapter:response',
    requestId: 'test-123',
    error: serialize(error) as any,
  };
}

describe('CacheProxy', () => {
  let cacheProxy: CacheProxy;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();

    const mockTransport: ITransport = {
      send: mockSend,
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    } as any;

    cacheProxy = new CacheProxy(mockTransport);
  });

  describe('Basic Cache Operations', () => {
    it('should call get via IPC', async () => {
      mockSend.mockResolvedValue(mockResponse({ value: 'test-data' }));

      const result = await cacheProxy.get('test-key');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('get');
      expect(result).toEqual({ value: 'test-data' });
    });

    it('should call get and return null when not found', async () => {
      mockSend.mockResolvedValue(mockResponse(null));

      const result = await cacheProxy.get('missing-key');

      expect(result).toBeNull();
    });

    it('should call set via IPC', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.set('test-key', { value: 'data' }, 60000);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('set');
    });

    it('should call set without TTL', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.set('permanent-key', { value: 'data' });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should call delete via IPC', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.delete('test-key');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('delete');
    });

    it('should call clear with pattern', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.clear('user:*');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('clear');
    });

    it('should call clear without pattern', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.clear();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sorted Set Operations', () => {
    it('should call zadd via IPC', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.zadd('jobs:scheduled', 1234567890, 'job-123');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('zadd');
    });

    it('should call zrangebyscore via IPC', async () => {
      const expectedMembers = ['job-1', 'job-2'];
      mockSend.mockResolvedValue(mockResponse(expectedMembers));

      const result = await cacheProxy.zrangebyscore('jobs:scheduled', 0, 1000000);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('zrangebyscore');
      expect(result).toEqual(expectedMembers);
    });

    it('should call zrem via IPC', async () => {
      mockSend.mockResolvedValue(mockResponse(undefined));

      await cacheProxy.zrem('jobs:scheduled', 'job-123');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('zrem');
    });
  });

  describe('Atomic Operations', () => {
    it('should call setIfNotExists via IPC and return true', async () => {
      mockSend.mockResolvedValue(mockResponse(true));

      const result = await cacheProxy.setIfNotExists(
        'lock:resource-123',
        { owner: 'worker-1' },
        30000
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]![0]!.adapter).toBe('cache');
      expect(mockSend.mock.calls[0]![0]!.method).toBe('setIfNotExists');
      expect(result).toBe(true);
    });

    it('should call setIfNotExists via IPC and return false', async () => {
      mockSend.mockResolvedValue(mockResponse(false));

      const result = await cacheProxy.setIfNotExists(
        'lock:resource-123',
        { owner: 'worker-2' },
        30000
      );

      expect(result).toBe(false);
    });
  });
});
