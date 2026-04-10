/**
 * Unit tests for MockEmbeddings adapter
 */

import { describe, it, expect } from 'vitest';
import { MockEmbeddings } from '../embeddings';

describe('MockEmbeddings', () => {
  it('should have dimensions property', () => {
    const embeddings = new MockEmbeddings();
    expect(embeddings.dimensions).toBe(1536);
  });

  it('should have getDimensions method for IPC transport', async () => {
    const embeddings = new MockEmbeddings();
    const dimensions = await embeddings.getDimensions();
    expect(dimensions).toBe(1536);
    expect(dimensions).toBe(embeddings.dimensions);
  });

  it('should generate deterministic vectors', async () => {
    const embeddings = new MockEmbeddings();
    const text = 'Hello world';

    const vector1 = await embeddings.embed(text);
    const vector2 = await embeddings.embed(text);

    expect(vector1).toEqual(vector2);
    expect(vector1).toHaveLength(1536);
  });

  it('should generate different vectors for different texts', async () => {
    const embeddings = new MockEmbeddings();

    const vector1 = await embeddings.embed('Hello');
    const vector2 = await embeddings.embed('World');

    expect(vector1).not.toEqual(vector2);
  });

  it('should generate normalized vectors', async () => {
    const embeddings = new MockEmbeddings();
    const vector = await embeddings.embed('Test text');

    // Calculate magnitude
    const magnitude = Math.sqrt(
      vector.reduce((sum, v) => sum + v * v, 0)
    );

    // Should be very close to 1.0 (normalized)
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it('should handle batch embeddings', async () => {
    const embeddings = new MockEmbeddings();
    const texts = ['Hello', 'World', 'Test'];

    const vectors = await embeddings.embedBatch(texts);

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(1536);
    expect(vectors[1]).toHaveLength(1536);
    expect(vectors[2]).toHaveLength(1536);

    // Each vector should be unique
    expect(vectors[0]).not.toEqual(vectors[1]);
    expect(vectors[1]).not.toEqual(vectors[2]);
  });

  it('should be deterministic across batch and single calls', async () => {
    const embeddings = new MockEmbeddings();
    const text = 'Deterministic test';

    const singleVector = await embeddings.embed(text);
    const batchVectors = await embeddings.embedBatch([text]);

    expect(singleVector).toEqual(batchVectors[0]);
  });
});
