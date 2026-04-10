import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LineBasedChunker } from '../line-based';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function collectChunks(
  chunker: LineBasedChunker,
  filePath: string,
  options?: Parameters<LineBasedChunker['chunkStream']>[1],
) {
  const chunks = [];
  for await (const chunk of chunker.chunkStream(filePath, options)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('LineBasedChunker', () => {
  const chunker = new LineBasedChunker();
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `line-based-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should have correct id and extensions', () => {
    expect(chunker.id).toBe('line-based');
    expect(chunker.extensions).toEqual([]);
  });

  it('should chunk simple text into lines', async () => {
    const filePath = join(testDir, 'test.txt');
    const text = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, text);

    const chunks = await collectChunks(chunker, filePath, { maxLines: 40, minLines: 1 });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.text).toContain('line 1');
    expect(chunks[0]?.span.startLine).toBe(1);
    expect(chunks[0]?.type).toBe('line-based');
  });

  it('should respect maxLines option', async () => {
    const filePath = join(testDir, 'large.txt');
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, lines);

    const chunks = await collectChunks(chunker, filePath, { maxLines: 50, minLines: 1 });

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      const chunkLines = chunk.text.split('\n').length;
      expect(chunkLines).toBeLessThanOrEqual(50);
    });
  });

  it('should respect minLines option', async () => {
    const filePath = join(testDir, 'short.txt');
    // Write enough lines so minLines filter keeps them
    const text = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, text);

    const chunks = await collectChunks(chunker, filePath, { maxLines: 40, minLines: 10 });

    chunks.forEach(chunk => {
      const chunkLines = chunk.text.split('\n').length;
      expect(chunkLines).toBeGreaterThanOrEqual(10);
    });
  });

  it('should handle empty file', async () => {
    const filePath = join(testDir, 'empty.txt');
    writeFileSync(filePath, '');

    const chunks = await collectChunks(chunker, filePath);
    expect(chunks).toEqual([]);
  });

  it('should handle whitespace-only file', async () => {
    const filePath = join(testDir, 'whitespace.txt');
    writeFileSync(filePath, '   \n\n   ');

    const chunks = await collectChunks(chunker, filePath);
    expect(chunks).toEqual([]);
  });

  it('should create overlapping chunks', async () => {
    const filePath = join(testDir, 'overlap.txt');
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, lines);

    const chunks = await collectChunks(chunker, filePath, { maxLines: 40, overlap: 10, minLines: 1 });

    if (chunks.length > 1) {
      const firstEnd = chunks[0]?.span.endLine;
      const secondStart = chunks[1]?.span.startLine;
      if (firstEnd !== undefined && secondStart !== undefined) {
        expect(secondStart).toBeLessThan(firstEnd);
      }
    }
  });

  it('should set correct span ranges', async () => {
    const filePath = join(testDir, 'spans.txt');
    const text = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, text);

    const chunks = await collectChunks(chunker, filePath, { maxLines: 40, minLines: 1 });

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.span.startLine).toBeGreaterThan(0);
      expect(chunk.span.endLine).toBeGreaterThanOrEqual(chunk.span.startLine);
    });
  });
});
