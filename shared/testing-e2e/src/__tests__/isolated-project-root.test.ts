import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createIsolatedProjectRoot } from '../isolated-project-root.js';

describe('createIsolatedProjectRoot', () => {
  it('creates a temp dir with a valid .kb/dev.config.json', async () => {
    const iso = await createIsolatedProjectRoot();
    try {
      expect(existsSync(iso.root)).toBe(true);
      expect(existsSync(iso.devConfigPath)).toBe(true);
      const config = JSON.parse(readFileSync(iso.devConfigPath, 'utf8'));
      expect(config.services['state-daemon']).toBeDefined();
      expect(existsSync(join(iso.root, '.kb/tmp'))).toBe(true);
      expect(existsSync(join(iso.root, '.kb/logs/tmp'))).toBe(true);
    } finally {
      await iso.cleanup();
    }
  });

  it('cleanup() removes the temp dir', async () => {
    const iso = await createIsolatedProjectRoot();
    const root = iso.root;
    await iso.cleanup();
    expect(existsSync(root)).toBe(false);
  });

  it('cleanup() is idempotent', async () => {
    const iso = await createIsolatedProjectRoot();
    await iso.cleanup();
    await expect(iso.cleanup()).resolves.toBeUndefined();
  });

  it('copyDevConfigFrom copies an existing workspace dev.config.json', async () => {
    // Use this very workspace as a source.
    const iso = await createIsolatedProjectRoot({
      copyDevConfigFrom: process.cwd().includes('kb-labs-workspace')
        ? findUpTo('kb-labs-workspace', process.cwd())
        : undefined,
    });
    try {
      expect(existsSync(iso.devConfigPath)).toBe(true);
    } finally {
      await iso.cleanup();
    }
  });
});

function findUpTo(marker: string, start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 20; i++) {
    if (dir.endsWith(marker)) {return dir;}
    const parent = dir.substring(0, dir.lastIndexOf('/'));
    if (!parent || parent === dir) {return undefined;}
    dir = parent;
  }
  return undefined;
}
