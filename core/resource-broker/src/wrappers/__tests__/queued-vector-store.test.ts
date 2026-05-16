import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueuedVectorStore, createQueuedVectorStore } from '../queued-vector-store.js';
import type { IVectorStore, VectorSearchResult, VectorRecord, VectorFilter } from '@kb-labs/core-platform';
import type { IResourceBroker, ResourceResponse } from '../../types.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function successResponse<T>(data: T): ResourceResponse<T> {
  return { success: true, data, retries: 0, waitTime: 0, processingTime: 1, totalTime: 1 };
}

function errorResponse(error: Error): ResourceResponse {
  return { success: false, error, retries: 0, waitTime: 0, processingTime: 0, totalTime: 0 };
}

interface CapturedEnqueue {
  resource: string;
  operation: string;
  args: unknown[];
  priority: string;
}

function makeBroker<T>(returnValue: T | Error): {
  broker: IResourceBroker;
  captured: CapturedEnqueue[];
} {
  const captured: CapturedEnqueue[] = [];

  const broker: IResourceBroker = {
    enqueue: vi.fn(async <R>(req: CapturedEnqueue): Promise<ResourceResponse<R>> => {
      captured.push({ resource: req.resource, operation: req.operation, args: req.args, priority: req.priority });
      if (returnValue instanceof Error) {
        return errorResponse(returnValue) as ResourceResponse<R>;
      }
      return successResponse(returnValue) as unknown as ResourceResponse<R>;
    }),
    register: vi.fn(),
    getStats: vi.fn(() => ({ resources: {}, totalRequests: 0, totalSuccess: 0, totalErrors: 0, queueSize: 0, uptime: 0 })),
    shutdown: vi.fn(async () => {}),
    isShuttingDown: vi.fn(() => false),
  } as unknown as IResourceBroker;

  return { broker, captured };
}

function makeVectorStore(withGet = true, withQuery = true): IVectorStore {
  const store: Partial<IVectorStore> = {
    search: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  if (withGet) store.get = vi.fn();
  if (withQuery) store.query = vi.fn();
  return store as IVectorStore;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QueuedVectorStore', () => {
  const mockResults: VectorSearchResult[] = [
    { id: 'v1', score: 0.95, payload: { text: 'hello' } },
  ];
  const mockVectors: VectorRecord[] = [
    { id: 'v1', vector: [0.1, 0.2], payload: {} },
  ];

  describe('createQueuedVectorStore', () => {
    it('returns a QueuedVectorStore instance', () => {
      const { broker } = makeBroker(null);
      const vs = createQueuedVectorStore(broker, makeVectorStore());
      expect(vs).toBeInstanceOf(QueuedVectorStore);
    });
  });

  describe('search()', () => {
    it('routes to broker with resource=vectorStore, operation=search', async () => {
      const { broker, captured } = makeBroker(mockResults);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      const result = await store.search([0.1, 0.2, 0.3], 5);

      expect(captured[0]!.resource).toBe('vectorStore');
      expect(captured[0]!.operation).toBe('search');
      expect(result).toEqual(mockResults);
    });

    it('passes filter argument to broker', async () => {
      const { broker, captured } = makeBroker([] as VectorSearchResult[]);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      const filter: VectorFilter = { must: [{ key: 'type', match: { value: 'doc' } }] };
      await store.search([0.1], 3, filter);
      expect(captured[0]!.args[2]).toEqual(filter);
    });

    it('throws when broker returns error response', async () => {
      const err = new Error('search failed');
      const { broker } = makeBroker(err);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      await expect(store.search([0.1], 5)).rejects.toThrow('search failed');
    });

    it('uses default priority=normal', async () => {
      const { broker, captured } = makeBroker([] as VectorSearchResult[]);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      await store.search([0.1], 5);
      expect(captured[0]!.priority).toBe('normal');
    });
  });

  describe('withPriority()', () => {
    it('sets priority on subsequent calls', async () => {
      const { broker, captured } = makeBroker([] as VectorSearchResult[]);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      store.withPriority('high');
      await store.search([0.1], 5);
      expect(captured[0]!.priority).toBe('high');
    });

    it('is chainable — returns this', () => {
      const { broker } = makeBroker(null);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      expect(store.withPriority('low')).toBe(store);
    });
  });

  describe('upsert()', () => {
    it('routes to broker with operation=upsert', async () => {
      const { broker, captured } = makeBroker(undefined);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      await store.upsert(mockVectors);
      expect(captured[0]!.operation).toBe('upsert');
      expect(captured[0]!.args[0]).toEqual(mockVectors);
    });

    it('throws on broker error', async () => {
      const { broker } = makeBroker(new Error('upsert failed'));
      const store = new QueuedVectorStore(broker, makeVectorStore());
      await expect(store.upsert([])).rejects.toThrow('upsert failed');
    });
  });

  describe('delete()', () => {
    it('routes to broker with operation=delete', async () => {
      const { broker, captured } = makeBroker(undefined);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      await store.delete(['id1', 'id2']);
      expect(captured[0]!.operation).toBe('delete');
      expect(captured[0]!.args[0]).toEqual(['id1', 'id2']);
    });
  });

  describe('count()', () => {
    it('returns count from broker', async () => {
      const { broker } = makeBroker(42);
      const store = new QueuedVectorStore(broker, makeVectorStore());
      expect(await store.count()).toBe(42);
    });
  });

  describe('get()', () => {
    it('routes to broker when underlying store supports get()', async () => {
      const { broker, captured } = makeBroker(mockVectors);
      const store = new QueuedVectorStore(broker, makeVectorStore(true));
      const result = await store.get(['v1']);
      expect(captured[0]!.operation).toBe('get');
      expect(result).toEqual(mockVectors);
    });

    it('throws "not supported" before calling broker when underlying lacks get()', async () => {
      const { broker, captured } = makeBroker(null);
      const store = new QueuedVectorStore(broker, makeVectorStore(false));
      await expect(store.get(['v1'])).rejects.toThrow('not supported');
      expect(captured).toHaveLength(0); // broker was never called
    });
  });

  describe('query()', () => {
    it('routes to broker when underlying store supports query()', async () => {
      const { broker } = makeBroker(mockVectors);
      const store = new QueuedVectorStore(broker, makeVectorStore(true, true));
      const filter: VectorFilter = { must: [] };
      const result = await store.query(filter);
      expect(result).toEqual(mockVectors);
    });

    it('throws "not supported" when underlying lacks query()', async () => {
      const { broker, captured } = makeBroker(null);
      const store = new QueuedVectorStore(broker, makeVectorStore(true, false));
      await expect(store.query({} as VectorFilter)).rejects.toThrow('not supported');
      expect(captured).toHaveLength(0);
    });
  });
});
