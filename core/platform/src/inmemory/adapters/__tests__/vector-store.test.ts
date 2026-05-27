import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVectorStore } from '../vector-store.js';

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('count is 0 for an empty store', async () => {
    expect(await store.count()).toBe(0);
  });

  it('upsert + count', async () => {
    await store.upsert([
      { id: 'a', vector: [1, 0], metadata: {} },
      { id: 'b', vector: [0, 1], metadata: {} },
    ]);
    expect(await store.count()).toBe(2);
  });

  it('upsert replaces by id', async () => {
    await store.upsert([{ id: 'a', vector: [1, 0], metadata: { v: 1 } }]);
    await store.upsert([{ id: 'a', vector: [0, 1], metadata: { v: 2 } }]);
    expect(await store.count()).toBe(1);
    const results = await store.search([0, 1], 1);
    expect(results[0]?.metadata?.v).toBe(2);
  });

  it('search ranks by cosine similarity (best first) and respects limit', async () => {
    await store.upsert([
      { id: 'parallel', vector: [1, 0], metadata: {} },
      { id: 'orthogonal', vector: [0, 1], metadata: {} },
      { id: 'near', vector: [0.9, 0.1], metadata: {} },
    ]);
    const results = await store.search([1, 0], 2);
    expect(results.map((r) => r.id)).toEqual(['parallel', 'near']);
    expect(results[0]?.score).toBeCloseTo(1, 5);
  });

  it('search returns 0 score when query vector is all zeros', async () => {
    await store.upsert([{ id: 'a', vector: [1, 2], metadata: {} }]);
    const [hit] = await store.search([0, 0], 1);
    expect(hit?.score).toBe(0);
  });

  it('search returns 0 score for length-mismatched vectors', async () => {
    await store.upsert([{ id: 'a', vector: [1, 2, 3], metadata: {} }]);
    const [hit] = await store.search([1, 0], 1);
    expect(hit?.score).toBe(0);
  });

  it('delete removes by id', async () => {
    await store.upsert([
      { id: 'a', vector: [1, 0], metadata: {} },
      { id: 'b', vector: [0, 1], metadata: {} },
    ]);
    await store.delete(['a']);
    expect(await store.count()).toBe(1);
    const results = await store.search([1, 0], 5);
    expect(results.map((r) => r.id)).toEqual(['b']);
  });

  describe('filters', () => {
    beforeEach(async () => {
      await store.upsert([
        { id: '1', vector: [1, 0], metadata: { kind: 'a', n: 10 } },
        { id: '2', vector: [1, 0], metadata: { kind: 'b', n: 20 } },
        { id: '3', vector: [1, 0], metadata: { kind: 'c', n: 30 } },
      ]);
    });

    it('eq', async () => {
      const r = await store.search([1, 0], 10, { field: 'kind', operator: 'eq', value: 'a' });
      expect(r.map((x) => x.id)).toEqual(['1']);
    });
    it('ne', async () => {
      const r = await store.search([1, 0], 10, { field: 'kind', operator: 'ne', value: 'a' });
      expect(r.map((x) => x.id).sort()).toEqual(['2', '3']);
    });
    it('gt / gte / lt / lte', async () => {
      expect((await store.search([1, 0], 10, { field: 'n', operator: 'gt', value: 10 })).map((x) => x.id).sort()).toEqual(['2', '3']);
      expect((await store.search([1, 0], 10, { field: 'n', operator: 'gte', value: 20 })).map((x) => x.id).sort()).toEqual(['2', '3']);
      expect((await store.search([1, 0], 10, { field: 'n', operator: 'lt', value: 30 })).map((x) => x.id).sort()).toEqual(['1', '2']);
      expect((await store.search([1, 0], 10, { field: 'n', operator: 'lte', value: 20 })).map((x) => x.id).sort()).toEqual(['1', '2']);
    });
    it('in / nin', async () => {
      expect((await store.search([1, 0], 10, { field: 'kind', operator: 'in', value: ['a', 'c'] })).map((x) => x.id).sort()).toEqual(['1', '3']);
      expect((await store.search([1, 0], 10, { field: 'kind', operator: 'nin', value: ['a', 'c'] })).map((x) => x.id).sort()).toEqual(['2']);
    });
  });
});
