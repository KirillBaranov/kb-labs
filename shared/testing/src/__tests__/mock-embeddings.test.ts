import { describe, it, expect } from 'vitest';
import { MockEmbeddings } from '../mock-embeddings.js';

describe('MockEmbeddings', () => {
  it('has the expected dimensions constant', () => {
    const embed = new MockEmbeddings();
    expect(embed.dimensions).toBe(1536);
  });

  it('getDimensions() resolves to the same value as the constant', async () => {
    const embed = new MockEmbeddings();
    expect(await embed.getDimensions()).toBe(embed.dimensions);
  });

  it('generates deterministic vectors for the same input', async () => {
    const embed = new MockEmbeddings();
    const text = 'Hello world';
    const v1 = await embed.embed(text);
    const v2 = await embed.embed(text);
    expect(v1).toEqual(v2);
    expect(v1).toHaveLength(1536);
  });

  it('generates different vectors for different inputs', async () => {
    const embed = new MockEmbeddings();
    const v1 = await embed.embed('Hello');
    const v2 = await embed.embed('World');
    expect(v1).not.toEqual(v2);
  });

  it('produces normalised vectors (magnitude ≈ 1)', async () => {
    const embed = new MockEmbeddings();
    const vec = await embed.embed('Test text');
    const magnitude = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it('embedBatch returns one vector per input', async () => {
    const embed = new MockEmbeddings();
    const texts = ['Hello', 'World', 'Test'];
    const vectors = await embed.embedBatch(texts);
    expect(vectors).toHaveLength(3);
    vectors.forEach((v) => expect(v).toHaveLength(1536));
    expect(vectors[0]).not.toEqual(vectors[1]);
  });

  it('embed and embedBatch produce identical vectors for the same text', async () => {
    const embed = new MockEmbeddings();
    const text = 'Deterministic test';
    const single = await embed.embed(text);
    const batch = await embed.embedBatch([text]);
    expect(single).toEqual(batch[0]);
  });
});
