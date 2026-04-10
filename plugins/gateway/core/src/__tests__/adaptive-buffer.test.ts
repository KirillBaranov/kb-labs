import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveBuffer, DEFAULT_BUFFER_POLICY, type BufferedCall } from '../buffer/adaptive.js';
import type { ICache } from '@kb-labs/core-platform';

function makeCache(): ICache {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    clear: vi.fn(async () => { store.clear(); }),
  } as unknown as ICache;
}

function makeCall(id: string): BufferedCall {
  return { requestId: id, adapter: 'fs', method: 'readFile', args: ['/tmp/test'], enqueuedAt: Date.now() };
}

describe('AdaptiveBuffer.ttlFor', () => {
  it('returns minTTL at full load (1.0)', () => {
    const buf = new AdaptiveBuffer(makeCache());
    expect(buf.ttlFor(1.0)).toBe(DEFAULT_BUFFER_POLICY.minTTL);
  });

  it('returns minTTL exactly at threshold', () => {
    const buf = new AdaptiveBuffer(makeCache());
    expect(buf.ttlFor(DEFAULT_BUFFER_POLICY.loadThreshold)).toBe(DEFAULT_BUFFER_POLICY.minTTL);
  });

  it('returns maxTTL at zero load', () => {
    const buf = new AdaptiveBuffer(makeCache());
    expect(buf.ttlFor(0)).toBe(DEFAULT_BUFFER_POLICY.maxTTL);
  });

  it('interpolates linearly between min and max', () => {
    const buf = new AdaptiveBuffer(makeCache());
    // load = 0.35 = half of threshold(0.7) → factor=0.5 → midpoint
    const ttl = buf.ttlFor(0.35);
    const expected = Math.round(
      DEFAULT_BUFFER_POLICY.minTTL +
      (DEFAULT_BUFFER_POLICY.maxTTL - DEFAULT_BUFFER_POLICY.minTTL) * 0.5,
    );
    expect(ttl).toBe(expected);
  });

  it('clamps to minTTL above threshold', () => {
    const buf = new AdaptiveBuffer(makeCache());
    expect(buf.ttlFor(0.9)).toBe(DEFAULT_BUFFER_POLICY.minTTL);
    expect(buf.ttlFor(1.5)).toBe(DEFAULT_BUFFER_POLICY.minTTL);
  });

  it('respects custom policy', () => {
    const buf = new AdaptiveBuffer(makeCache(), { minTTL: 1000, maxTTL: 10000, maxSize: 10, loadThreshold: 0.5 });
    expect(buf.ttlFor(0)).toBe(10000);
    expect(buf.ttlFor(0.5)).toBe(1000);
    expect(buf.ttlFor(1.0)).toBe(1000);
  });
});

describe('AdaptiveBuffer.enqueue', () => {
  let cache: ICache;
  let buf: AdaptiveBuffer;

  beforeEach(() => {
    cache = makeCache();
    buf = new AdaptiveBuffer(cache);
  });

  it('stores a call in cache', async () => {
    const call = makeCall('req-1');
    await buf.enqueue('host-a', call, 0);
    expect(cache.set).toHaveBeenCalledOnce();
    const [key, value] = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe('host:buffer:host-a');
    expect(value).toEqual([call]);
  });

  it('appends to existing buffer', async () => {
    const c1 = makeCall('req-1');
    const c2 = makeCall('req-2');
    await buf.enqueue('host-a', c1, 0);
    await buf.enqueue('host-a', c2, 0);
    // Second set call should have both calls
    const [, value] = (cache.set as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(value).toHaveLength(2);
    expect((value as BufferedCall[])[1]!.requestId).toBe('req-2');
  });

  it('throws HOST_BUFFER_FULL when maxSize exceeded', async () => {
    buf = new AdaptiveBuffer(cache, { ...DEFAULT_BUFFER_POLICY, maxSize: 2 });
    await buf.enqueue('host-a', makeCall('r1'), 0);
    await buf.enqueue('host-a', makeCall('r2'), 0);
    await expect(buf.enqueue('host-a', makeCall('r3'), 0)).rejects.toThrow('HOST_BUFFER_FULL');
  });

  it('uses adaptive TTL when calling cache.set', async () => {
    await buf.enqueue('host-a', makeCall('r1'), 0); // load=0 → maxTTL
    const [, , ttl] = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(ttl).toBe(DEFAULT_BUFFER_POLICY.maxTTL);
  });
});

describe('AdaptiveBuffer.flush', () => {
  let cache: ICache;
  let buf: AdaptiveBuffer;

  beforeEach(() => {
    cache = makeCache();
    buf = new AdaptiveBuffer(cache);
  });

  it('returns buffered calls and clears buffer', async () => {
    const c1 = makeCall('req-1');
    const c2 = makeCall('req-2');
    await buf.enqueue('host-a', c1, 0);
    await buf.enqueue('host-a', c2, 0);

    const result = await buf.flush('host-a');
    expect(result).toHaveLength(2);
    expect(result[0]!.requestId).toBe('req-1');
    expect(result[1]!.requestId).toBe('req-2');
    expect(cache.delete).toHaveBeenCalledWith('host:buffer:host-a');
  });

  it('returns empty array when buffer is empty', async () => {
    const result = await buf.flush('host-unknown');
    expect(result).toEqual([]);
  });

  it('buffer is empty after flush', async () => {
    await buf.enqueue('host-a', makeCall('r1'), 0);
    await buf.flush('host-a');
    // Subsequent flush returns empty
    const result = await buf.flush('host-a');
    expect(result).toEqual([]);
  });
});
