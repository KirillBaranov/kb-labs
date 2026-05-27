import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryArtifacts } from '../artifacts.js';

describe('InMemoryArtifacts', () => {
  let store: InMemoryArtifacts;

  beforeEach(() => {
    store = new InMemoryArtifacts();
  });

  it('read returns null when key is missing', async () => {
    expect(await store.read('missing')).toBeNull();
  });

  it('write + read round-trip', async () => {
    await store.write('k', { hello: 'world' });
    expect(await store.read('k')).toEqual({ hello: 'world' });
  });

  it('exists / delete', async () => {
    await store.write('k', 'x');
    expect(await store.exists('k')).toBe(true);
    await store.delete('k');
    expect(await store.exists('k')).toBe(false);
  });

  it('getMeta captures contentType, size and timestamps', async () => {
    await store.write('k', { a: 1 });
    const meta = await store.getMeta('k');
    expect(meta).toMatchObject({
      key: 'k',
      contentType: 'application/json',
      size: JSON.stringify({ a: 1 }).length,
    });
    expect(meta?.createdAt).toBeInstanceOf(Date);
    expect(meta?.updatedAt).toBeInstanceOf(Date);
  });

  it('getMeta returns null for missing key', async () => {
    expect(await store.getMeta('absent')).toBeNull();
  });

  it('write preserves createdAt across overwrites', async () => {
    await store.write('k', { v: 1 });
    const first = await store.getMeta('k');
    await new Promise((r) => setTimeout(r, 5));
    await store.write('k', { v: 2 });
    const second = await store.getMeta('k');
    expect(second?.createdAt).toEqual(first?.createdAt);
    expect((second?.updatedAt?.getTime() ?? 0) >= (first?.updatedAt?.getTime() ?? 0)).toBe(true);
  });

  it('write accepts custom contentType + metadata', async () => {
    await store.write('k', 'raw', { contentType: 'text/plain', metadata: { tag: 'x' } });
    const meta = await store.getMeta('k');
    expect(meta?.contentType).toBe('text/plain');
    expect(meta?.metadata).toEqual({ tag: 'x' });
  });

  it('list returns metadata for matching prefix only', async () => {
    await store.write('a/1', 1);
    await store.write('a/2', 2);
    await store.write('b/1', 3);
    const items = await store.list('a/');
    expect(items.map((i) => i.key).sort()).toEqual(['a/1', 'a/2']);
  });
});
