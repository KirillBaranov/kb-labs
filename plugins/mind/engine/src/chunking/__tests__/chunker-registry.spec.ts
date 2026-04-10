import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkerRegistry, type Chunker } from '../chunker';
import { LineBasedChunker } from '../line-based';

describe('ChunkerRegistry', () => {
  let registry: ChunkerRegistry;

  beforeEach(() => {
    registry = new ChunkerRegistry();
  });

  it('should register chunker', () => {
    const chunker = new LineBasedChunker();
    registry.register(chunker);

    // LineBasedChunker has empty extensions array, so it won't be found by extension
    // But it should be in getAll()
    const all = registry.getAll();
    expect(all).toContain(chunker);
  });

  it('should find chunker by extension', () => {
    const chunker: Chunker = {
      id: 'test',
      extensions: ['.ts', '.tsx'],
      languages: ['typescript'],
      chunk: () => [],
    };

    registry.register(chunker);
    const found = registry.findByExtension('.ts');
    expect(found).toBe(chunker);
  });

  it('should find chunker by language', () => {
    const chunker: Chunker = {
      id: 'test',
      extensions: ['.ts'],
      languages: ['typescript'],
      chunk: () => [],
    };

    registry.register(chunker);
    const found = registry.findByLanguage('typescript');
    expect(found).toBe(chunker);
  });

  it('should return null if no chunker found', () => {
    const found = registry.findByExtension('.unknown');
    expect(found).toBeNull();
  });

  it('should handle multiple chunkers with same extension', () => {
    const chunker1: Chunker = {
      id: 'test1',
      extensions: ['.ts'],
      chunk: () => [],
    };

    const chunker2: Chunker = {
      id: 'test2',
      extensions: ['.ts'],
      chunk: () => [],
    };

    registry.register(chunker1);
    registry.register(chunker2);

    // Should return the last registered one
    const found = registry.findByExtension('.ts');
    expect(found).toBe(chunker2);
  });

  it('should get all registered chunkers', () => {
    const chunker1 = new LineBasedChunker();
    const chunker2: Chunker = {
      id: 'test',
      extensions: ['.ts'],
      chunk: () => [],
    };

    registry.register(chunker1);
    registry.register(chunker2);

    const all = registry.getAll();
    expect(all.length).toBe(2);
    expect(all).toContain(chunker1);
    expect(all).toContain(chunker2);
  });
});

