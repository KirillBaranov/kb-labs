import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../storage.js';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it('read returns null for missing paths', async () => {
    expect(await storage.read('nope')).toBeNull();
  });

  it('write + read round-trip', async () => {
    await storage.write('a.bin', Buffer.from('hello'));
    expect((await storage.read('a.bin'))?.toString()).toBe('hello');
  });

  it('exists reflects presence', async () => {
    expect(await storage.exists('k')).toBe(false);
    await storage.write('k', Buffer.from('x'));
    expect(await storage.exists('k')).toBe(true);
  });

  it('delete removes entries', async () => {
    await storage.write('k', Buffer.from('x'));
    await storage.delete('k');
    expect(await storage.exists('k')).toBe(false);
  });

  it('list filters by prefix and sorts', async () => {
    await storage.write('b/x', Buffer.from('1'));
    await storage.write('a/x', Buffer.from('2'));
    await storage.write('a/y', Buffer.from('3'));
    expect(await storage.list('a/')).toEqual(['a/x', 'a/y']);
  });

  it('stat returns null for missing path', async () => {
    expect(await storage.stat('missing')).toBeNull();
  });

  it('stat returns metadata for stored files', async () => {
    await storage.write('k', Buffer.from('abcd'));
    const meta = await storage.stat('k');
    expect(meta).toMatchObject({
      path: 'k',
      size: 4,
      contentType: 'application/octet-stream',
    });
    expect(typeof meta?.lastModified).toBe('string');
  });

  it('stat reports the actual write time (not a fresh Date())', async () => {
    await storage.write('k', Buffer.from('x'));
    const first = (await storage.stat('k'))!.lastModified;
    await new Promise((r) => { setTimeout(r, 5); });
    const second = (await storage.stat('k'))!.lastModified;
    expect(second).toBe(first);
  });

  it('copy duplicates file with independent buffer', async () => {
    const src = Buffer.from('hello');
    await storage.write('src', src);
    await storage.copy('src', 'dst');
    expect((await storage.read('dst'))?.toString()).toBe('hello');
    // Mutate destination buffer, source must not change.
    const dstBuf = (await storage.read('dst'))!;
    dstBuf[0] = 0;
    expect((await storage.read('src'))?.toString()).toBe('hello');
  });

  it('copy throws when source is missing', async () => {
    await expect(storage.copy('absent', 'dst')).rejects.toThrow(/Source file not found/);
  });

  it('move transfers entry', async () => {
    await storage.write('src', Buffer.from('x'));
    await storage.move('src', 'dst');
    expect(await storage.exists('src')).toBe(false);
    expect((await storage.read('dst'))?.toString()).toBe('x');
  });

  it('move throws when source is missing', async () => {
    await expect(storage.move('absent', 'dst')).rejects.toThrow(/Source file not found/);
  });

  it('listWithMetadata returns sorted metadata matching prefix', async () => {
    await storage.write('p/b', Buffer.from('22'));
    await storage.write('p/a', Buffer.from('1'));
    await storage.write('other', Buffer.from('x'));
    const list = await storage.listWithMetadata('p/');
    expect(list.map((m) => m.path)).toEqual(['p/a', 'p/b']);
    expect(list[0]?.size).toBe(1);
    expect(list[1]?.size).toBe(2);
  });

  it('size + clear', async () => {
    expect(storage.size).toBe(0);
    await storage.write('a', Buffer.from('x'));
    await storage.write('b', Buffer.from('y'));
    expect(storage.size).toBe(2);
    storage.clear();
    expect(storage.size).toBe(0);
  });
});
