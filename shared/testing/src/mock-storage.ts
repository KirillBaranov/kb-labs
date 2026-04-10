/**
 * @module @kb-labs/shared-testing/mock-storage
 *
 * Virtual filesystem mock for IStorage interface.
 * All methods are vi.fn() spies.
 *
 * @example
 * ```typescript
 * const storage = mockStorage({
 *   'config.json': '{"key": "value"}',
 *   'data/file.txt': 'hello world',
 * });
 *
 * const content = await storage.read('config.json');
 * expect(content?.toString()).toBe('{"key": "value"}');
 * expect(storage.read).toHaveBeenCalledWith('config.json');
 * ```
 */

import { vi } from 'vitest';
import type { IStorage } from '@kb-labs/core-platform';

/**
 * Mock storage instance with in-memory virtual filesystem.
 */
export interface MockStorageInstance extends IStorage {
  /** Direct access to the virtual filesystem (for assertions) */
  readonly files: Map<string, Buffer>;
  /** Reset all files and spy call history */
  reset: () => void;
}

/**
 * Create a mock storage with in-memory virtual filesystem.
 *
 * @param initial - Optional initial files. Keys are paths, values are content (string or Buffer).
 *
 * @example
 * ```typescript
 * const storage = mockStorage({
 *   'data.json': JSON.stringify({ items: [] }),
 *   'binary.dat': Buffer.from([0x00, 0x01]),
 * });
 *
 * // Write and read
 * await storage.write('new.txt', Buffer.from('hello'));
 * expect(await storage.exists('new.txt')).toBe(true);
 *
 * // List files
 * const files = await storage.list('');
 * expect(files).toContain('new.txt');
 * ```
 */
export function mockStorage(initial?: Record<string, string | Buffer>): MockStorageInstance {
  const files = new Map<string, Buffer>();

  // Populate initial files
  if (initial) {
    for (const [path, content] of Object.entries(initial)) {
      files.set(path, typeof content === 'string' ? Buffer.from(content) : content);
    }
  }

  const readFn = vi.fn(async (path: string): Promise<Buffer | null> => {
    return files.get(path) ?? null;
  });

  const writeFn = vi.fn(async (path: string, data: Buffer): Promise<void> => {
    files.set(path, data);
  });

  const deleteFn = vi.fn(async (path: string): Promise<void> => {
    files.delete(path);
  });

  const listFn = vi.fn(async (prefix: string): Promise<string[]> => {
    const result: string[] = [];
    for (const path of files.keys()) {
      if (path.startsWith(prefix)) {
        result.push(path);
      }
    }
    return result.sort();
  });

  const existsFn = vi.fn(async (path: string): Promise<boolean> => {
    return files.has(path);
  });

  const instance: MockStorageInstance = {
    read: readFn,
    write: writeFn,
    delete: deleteFn,
    list: listFn,
    exists: existsFn,
    get files() { return files; },
    reset: () => {
      files.clear();
      readFn.mockClear();
      writeFn.mockClear();
      deleteFn.mockClear();
      listFn.mockClear();
      existsFn.mockClear();
    },
  };

  return instance;
}
