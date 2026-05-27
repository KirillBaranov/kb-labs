/**
 * @module @kb-labs/adapters-sqlite/__tests__/shared-handle
 *
 * Tests for acquireHandle directory-creation safety.
 *
 * Regression: better-sqlite3 does not create parent directories.
 * acquireHandle() must call mkdirSync({ recursive: true }) before opening
 * a new file so that "filename": ".kb/data/platform.db" works even when
 * the .kb/data/ directory does not yet exist.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { acquireHandle } from '../shared-handle.js';

describe('acquireHandle — directory creation', () => {
  const handles: Array<{ release: () => void }> = [];

  afterEach(() => {
    for (const h of handles) { try { h.release(); } catch { /* already closed */ } }
    handles.length = 0;
  });

  it('creates nested parent directories when they do not exist', async () => {
    const base = await mkdtemp(join(tmpdir(), 'sqlite-test-'));
    try {
      // Deep nested path that does not yet exist
      const filename = join(base, 'a', 'b', 'c', 'platform.db');

      expect(() => {
        const h = acquireHandle({ filename });
        handles.push(h);
      }).not.toThrow();

      // DB must be usable after opening
      const h = handles[0];
      expect(h.handle.open).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('opens an existing file without re-creating the directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'sqlite-test-'));
    try {
      // First open creates directories and file
      const filename = join(base, 'sub', 'db.sqlite');
      const h1 = acquireHandle({ filename });
      h1.release();

      // Second open must succeed on the already-existing file
      expect(() => {
        const h2 = acquireHandle({ filename });
        handles.push(h2);
      }).not.toThrow();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
