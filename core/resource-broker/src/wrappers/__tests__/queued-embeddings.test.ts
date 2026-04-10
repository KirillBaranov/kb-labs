/**
 * Unit tests for QueuedEmbeddings wrapper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QueuedEmbeddings } from '../queued-embeddings';
import { ResourceBroker, InMemoryRateLimitBackend } from '../../index';
import { MockEmbeddings } from '@kb-labs/core-platform/noop';

describe('QueuedEmbeddings', () => {
  let broker: ResourceBroker;
  let mockEmbeddings: MockEmbeddings;
  let queuedEmbeddings: QueuedEmbeddings;

  beforeEach(() => {
    const backend = new InMemoryRateLimitBackend();
    broker = new ResourceBroker(backend);
    mockEmbeddings = new MockEmbeddings();

    // Register embeddings resource
    broker.register('embeddings', {
      rateLimits: { maxConcurrentRequests: 10 },
      maxRetries: 3,
      timeout: 30000,
      executor: async (operation: string, args: unknown[]) => {
        if (operation === 'embed') {
          return mockEmbeddings.embed(args[0] as string);
        }
        if (operation === 'embedBatch') {
          return mockEmbeddings.embedBatch(args[0] as string[]);
        }
        throw new Error(`Unknown operation: ${operation}`);
      },
    });

    queuedEmbeddings = new QueuedEmbeddings(broker, mockEmbeddings);
  });

  it('should have dimensions property', () => {
    expect(queuedEmbeddings.dimensions).toBe(1536);
  });

  it('should have getDimensions method for IPC transport', async () => {
    const dimensions = await queuedEmbeddings.getDimensions();
    expect(dimensions).toBe(1536);
    expect(dimensions).toBe(mockEmbeddings.dimensions);
  });

  it('should embed single text through queue', async () => {
    const vector = await queuedEmbeddings.embed('Hello world');

    expect(vector).toHaveLength(1536);
    expect(Array.isArray(vector)).toBe(true);
  });

  it('should embed batch through queue', async () => {
    const vectors = await queuedEmbeddings.embedBatch(['Hello', 'World']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1536);
    expect(vectors[1]).toHaveLength(1536);
  });

  it('should support priority setting', async () => {
    const result = queuedEmbeddings.withPriority('high');
    expect(result).toBe(queuedEmbeddings); // Check chaining
  });

  it('should handle empty batch', async () => {
    const vectors = await queuedEmbeddings.embedBatch([]);
    expect(vectors).toHaveLength(0);
  });

  it('should produce deterministic results', async () => {
    const text = 'Deterministic test';

    const vector1 = await queuedEmbeddings.embed(text);
    const vector2 = await queuedEmbeddings.embed(text);

    expect(vector1).toEqual(vector2);
  });
});
