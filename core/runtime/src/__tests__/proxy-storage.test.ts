import { describe, it, expect, vi } from 'vitest';
import { StorageProxy, createStorageProxy } from '../proxy/storage-proxy.js';
import { EmbeddingsProxy, createEmbeddingsProxy } from '../proxy/embeddings-proxy.js';
import type { ITransport } from '../transport/transport.js';
import type { AdapterCall, AdapterResponse } from '@kb-labs/core-platform/serializable';
import { serialize } from '@kb-labs/core-platform/serializable';

// ── Test helpers ─────────────────────────────────────────────────────────────

type CapturedCall = {
  adapter: string;
  method: string;
  args: unknown[];
};

function makeMockTransport(returnValue: unknown = undefined, throwError?: Error): {
  transport: ITransport;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];

  const transport: ITransport = {
    send: vi.fn(async (call: AdapterCall): Promise<AdapterResponse> => {
      calls.push({ adapter: call.adapter, method: call.method, args: call.args });
      if (throwError) {
        return { requestId: call.requestId, error: serialize(throwError) } as AdapterResponse;
      }
      return {
        requestId: call.requestId,
        result: returnValue !== undefined ? serialize(returnValue) : undefined,
      } as AdapterResponse;
    }),
    close: vi.fn(async () => {}),
    isClosed: vi.fn(() => false),
  };

  return { transport, calls };
}

// ── StorageProxy ──────────────────────────────────────────────────────────────

describe('StorageProxy', () => {
  it('createStorageProxy returns StorageProxy instance', () => {
    const { transport } = makeMockTransport();
    const proxy = createStorageProxy(transport);
    expect(proxy).toBeInstanceOf(StorageProxy);
  });

  it('read() calls transport with adapter=storage, method=read', async () => {
    const buf = Buffer.from('hello world');
    const { transport, calls } = makeMockTransport(buf);
    const proxy = new StorageProxy(transport);

    const result = await proxy.read('some/path.txt');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.adapter).toBe('storage');
    expect(calls[0]!.method).toBe('read');
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.toString()).toBe('hello world');
  });

  it('read() returns null for missing file (null response)', async () => {
    const { transport } = makeMockTransport(null);
    const proxy = new StorageProxy(transport);
    const result = await proxy.read('nonexistent.txt');
    expect(result).toBeNull();
  });

  it('read() with buffer containing null bytes survives serialization', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x00, 0xFF, 0x00]);
    const { transport } = makeMockTransport(buf);
    const proxy = new StorageProxy(transport);
    const result = await proxy.read('binary.bin');
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.equals(buf)).toBe(true);
  });

  it('write() calls transport with path and data args', async () => {
    const { transport, calls } = makeMockTransport(undefined);
    const proxy = new StorageProxy(transport);
    const data = Buffer.from('{"key":"value"}');

    await proxy.write('config.json', data);

    expect(calls[0]!.method).toBe('write');
    expect(calls[0]!.args).toHaveLength(2);
  });

  it('delete() sends delete call', async () => {
    const { transport, calls } = makeMockTransport(undefined);
    const proxy = new StorageProxy(transport);
    await proxy.delete('old/file.txt');
    expect(calls[0]!.method).toBe('delete');
  });

  it('list() returns array of paths', async () => {
    const paths = ['docs/a.md', 'docs/b.md', 'docs/c.md'];
    const { transport } = makeMockTransport(paths);
    const proxy = new StorageProxy(transport);
    const result = await proxy.list('docs/');
    expect(result).toEqual(paths);
  });

  it('list() on nonexistent prefix returns empty array', async () => {
    const { transport } = makeMockTransport([]);
    const proxy = new StorageProxy(transport);
    const result = await proxy.list('nonexistent/');
    expect(result).toEqual([]);
  });

  it('exists() returns boolean from transport', async () => {
    const { transport: t1 } = makeMockTransport(true);
    expect(await new StorageProxy(t1).exists('found.txt')).toBe(true);

    const { transport: t2 } = makeMockTransport(false);
    expect(await new StorageProxy(t2).exists('missing.txt')).toBe(false);
  });

  it('propagates remote error from transport', async () => {
    const remoteErr = new Error('permission denied');
    const { transport } = makeMockTransport(undefined, remoteErr);
    const proxy = new StorageProxy(transport);
    await expect(proxy.read('locked.txt')).rejects.toThrow('permission denied');
  });

  it('stat() calls transport with stat method', async () => {
    const meta = { path: 'file.txt', size: 42, mtime: new Date('2025-01-01') };
    const { transport, calls } = makeMockTransport(meta);
    const proxy = new StorageProxy(transport);
    await proxy.stat!('file.txt');
    expect(calls[0]!.method).toBe('stat');
  });

  it('copy() and move() send correct methods', async () => {
    const { transport, calls } = makeMockTransport(undefined);
    const proxy = new StorageProxy(transport);
    await proxy.copy!('src.txt', 'dst.txt');
    await proxy.move!('old.txt', 'new.txt');
    expect(calls[0]!.method).toBe('copy');
    expect(calls[1]!.method).toBe('move');
  });

  it('listWithMetadata() sends correct method', async () => {
    const { transport, calls } = makeMockTransport([]);
    const proxy = new StorageProxy(transport);
    await proxy.listWithMetadata!('prefix/');
    expect(calls[0]!.method).toBe('listWithMetadata');
  });
});

// ── EmbeddingsProxy ───────────────────────────────────────────────────────────

describe('EmbeddingsProxy', () => {
  it('createEmbeddingsProxy returns EmbeddingsProxy instance', () => {
    const { transport } = makeMockTransport();
    const proxy = createEmbeddingsProxy(transport, 1536);
    expect(proxy).toBeInstanceOf(EmbeddingsProxy);
  });

  it('constructor with dimensions skips IPC for dimensions property', () => {
    const { transport } = makeMockTransport();
    const proxy = new EmbeddingsProxy(transport, 1536);
    expect(proxy.dimensions).toBe(1536); // no transport call
    expect((transport.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('dimensions throws before getDimensions() is called', () => {
    const { transport } = makeMockTransport();
    const proxy = new EmbeddingsProxy(transport); // no dimensions passed
    expect(() => proxy.dimensions).toThrow('not initialized');
  });

  it('getDimensions() fetches once and caches', async () => {
    let callCount = 0;
    const transport: ITransport = {
      send: vi.fn(async (call: AdapterCall): Promise<AdapterResponse> => {
        callCount++;
        return { requestId: call.requestId, result: serialize(1536) } as AdapterResponse;
      }),
      close: vi.fn(async () => {}),
      isClosed: vi.fn(() => false),
    };

    const proxy = new EmbeddingsProxy(transport);
    const d1 = await proxy.getDimensions();
    const d2 = await proxy.getDimensions(); // second call — should use cache
    const d3 = proxy.dimensions; // property access — no IPC

    expect(d1).toBe(1536);
    expect(d2).toBe(1536);
    expect(d3).toBe(1536);
    expect(callCount).toBe(1); // only one transport call total
  });

  it('embed() calls transport with adapter=embeddings, method=embed', async () => {
    const vector = [0.1, 0.2, 0.3];
    const { transport, calls } = makeMockTransport(vector);
    const proxy = new EmbeddingsProxy(transport, 3);
    const result = await proxy.embed('hello');
    expect(calls[0]!.adapter).toBe('embeddings');
    expect(calls[0]!.method).toBe('embed');
    expect(result).toEqual(vector);
  });

  it('embedBatch() preserves order of input texts', async () => {
    const vectors = [[1, 2], [3, 4], [5, 6]];
    const { transport } = makeMockTransport(vectors);
    const proxy = new EmbeddingsProxy(transport, 2);
    const result = await proxy.embedBatch(['a', 'b', 'c']);
    expect(result).toEqual(vectors);
  });

  it('embedBatch([]) returns empty array', async () => {
    const { transport } = makeMockTransport([]);
    const proxy = new EmbeddingsProxy(transport, 1536);
    const result = await proxy.embedBatch([]);
    expect(result).toEqual([]);
  });
});
