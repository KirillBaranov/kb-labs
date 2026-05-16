import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriorityQueue } from '../priority-queue.js';
import type { QueueItem } from '../../types.js';

function makeItem(id: string, resource: string, priority: 'high' | 'normal' | 'low' = 'normal'): QueueItem {
  return {
    request: { id, resource, operation: 'test', args: [], priority, estimatedTokens: 0, createdAt: Date.now() },
    resolve: vi.fn(),
    reject: vi.fn(),
    enqueuedAt: Date.now(),
  } as unknown as QueueItem;
}

describe('PriorityQueue — sizeByPriority', () => {
  it('returns zeros for an empty queue', () => {
    const q = new PriorityQueue();
    expect(q.sizeByPriority()).toEqual({ high: 0, normal: 0, low: 0 });
  });

  it('counts each priority bucket independently', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('h1', 'res', 'high'));
    q.enqueue(makeItem('h2', 'res', 'high'));
    q.enqueue(makeItem('n1', 'res', 'normal'));
    q.enqueue(makeItem('l1', 'res', 'low'));

    expect(q.sizeByPriority()).toEqual({ high: 2, normal: 1, low: 1 });
  });

  it('decrements the correct bucket after dequeue', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('h1', 'res', 'high'));
    q.enqueue(makeItem('n1', 'res', 'normal'));
    q.dequeue(); // removes high

    expect(q.sizeByPriority()).toEqual({ high: 0, normal: 1, low: 0 });
  });
});

describe('PriorityQueue — clear', () => {
  it('returns all items in high → normal → low order', () => {
    const q = new PriorityQueue();
    const h = makeItem('h1', 'res', 'high');
    const n = makeItem('n1', 'res', 'normal');
    const l = makeItem('l1', 'res', 'low');
    q.enqueue(h);
    q.enqueue(n);
    q.enqueue(l);

    const all = q.clear();

    expect(all).toHaveLength(3);
    expect(all[0]).toBe(h);
    expect(all[1]).toBe(n);
    expect(all[2]).toBe(l);
  });

  it('leaves the queue empty after clear', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('a', 'res', 'high'));
    q.enqueue(makeItem('b', 'res', 'low'));

    q.clear();

    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
  });

  it('returns empty array when queue is already empty', () => {
    const q = new PriorityQueue();
    expect(q.clear()).toEqual([]);
  });
});

describe('PriorityQueue — remove', () => {
  it('removes and returns item from high priority bucket', () => {
    const q = new PriorityQueue();
    const item = makeItem('h1', 'res', 'high');
    q.enqueue(item);

    const removed = q.remove('h1');

    expect(removed).toBe(item);
    expect(q.size()).toBe(0);
  });

  it('removes and returns item from normal priority bucket', () => {
    const q = new PriorityQueue();
    const item = makeItem('n1', 'res', 'normal');
    q.enqueue(item);

    const removed = q.remove('n1');

    expect(removed).toBe(item);
    expect(q.isEmpty()).toBe(true);
  });

  it('removes and returns item from low priority bucket', () => {
    const q = new PriorityQueue();
    const item = makeItem('l1', 'res', 'low');
    q.enqueue(item);

    const removed = q.remove('l1');

    expect(removed).toBe(item);
    expect(q.isEmpty()).toBe(true);
  });

  it('returns undefined when requestId is not found', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('a', 'res', 'normal'));

    expect(q.remove('nonexistent')).toBeUndefined();
    expect(q.size()).toBe(1);
  });

  it('removes only the target item, leaving the rest intact', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('a', 'res', 'normal'));
    q.enqueue(makeItem('b', 'res', 'normal'));
    q.enqueue(makeItem('c', 'res', 'normal'));

    q.remove('b');

    expect(q.size()).toBe(2);
    const ids = [...q].map(i => i.request.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
  });
});

describe('PriorityQueue — getByResource', () => {
  it('returns all items matching the resource across all priorities', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('h1', 'llm', 'high'));
    q.enqueue(makeItem('n1', 'llm', 'normal'));
    q.enqueue(makeItem('l1', 'llm', 'low'));
    q.enqueue(makeItem('n2', 'embeddings', 'normal'));

    const result = q.getByResource('llm');

    expect(result).toHaveLength(3);
    const ids = result.map(i => i.request.id);
    expect(ids).toContain('h1');
    expect(ids).toContain('n1');
    expect(ids).toContain('l1');
  });

  it('returns empty array when no items match the resource', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('n1', 'llm', 'normal'));

    expect(q.getByResource('embeddings')).toEqual([]);
  });

  it('returns items in high → normal → low order', () => {
    const q = new PriorityQueue();
    const low = makeItem('l1', 'res', 'low');
    const high = makeItem('h1', 'res', 'high');
    const norm = makeItem('n1', 'res', 'normal');
    q.enqueue(low);
    q.enqueue(high);
    q.enqueue(norm);

    const result = q.getByResource('res');

    expect(result[0]).toBe(high);
    expect(result[1]).toBe(norm);
    expect(result[2]).toBe(low);
  });
});

describe('PriorityQueue — sizeByResource', () => {
  it('counts only items for the given resource', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('h1', 'llm', 'high'));
    q.enqueue(makeItem('n1', 'llm', 'normal'));
    q.enqueue(makeItem('n2', 'embeddings', 'normal'));

    expect(q.sizeByResource('llm')).toBe(2);
    expect(q.sizeByResource('embeddings')).toBe(1);
  });

  it('returns 0 for an unregistered resource', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('n1', 'llm', 'normal'));

    expect(q.sizeByResource('vectorStore')).toBe(0);
  });

  it('returns 0 after all matching items are removed', () => {
    const q = new PriorityQueue();
    q.enqueue(makeItem('a', 'llm', 'normal'));
    q.remove('a');

    expect(q.sizeByResource('llm')).toBe(0);
  });
});
