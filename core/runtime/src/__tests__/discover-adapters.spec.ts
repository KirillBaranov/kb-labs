import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverAdapters } from '../discover-adapters.js';

describe('discoverAdapters (lock-based)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discover-adapters-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty map when no lock file exists', async () => {
    const result = await discoverAdapters(tmpDir);
    expect(result.size).toBe(0);
  });

  it('returns empty map when lock has no adapters', async () => {
    await writeLock(tmpDir, {
      '@test/plugin': {
        version: '1.0.0',
        integrity: 'sha256-abc',
        resolvedPath: './packages/plugin',
        installedAt: new Date().toISOString(),
        source: 'local',
        primaryKind: 'plugin',
        provides: ['plugin'],
      },
    });

    const result = await discoverAdapters(tmpDir);
    expect(result.size).toBe(0);
  });

  it('skips disabled adapters', async () => {
    await writeLock(tmpDir, {
      '@test/adapter': {
        version: '1.0.0',
        integrity: 'sha256-abc',
        resolvedPath: './packages/adapter',
        installedAt: new Date().toISOString(),
        source: 'local',
        primaryKind: 'adapter',
        provides: ['adapter'],
        enabled: false,
      },
    });

    const result = await discoverAdapters(tmpDir);
    expect(result.size).toBe(0);
  });

  it('skips adapters without built dist', async () => {
    await writeLock(tmpDir, {
      '@test/adapter': {
        version: '1.0.0',
        integrity: 'sha256-abc',
        resolvedPath: './packages/adapter',
        installedAt: new Date().toISOString(),
        source: 'local',
        primaryKind: 'adapter',
        provides: ['adapter'],
      },
    });

    // Create package dir but no dist
    const pkgDir = path.join(tmpDir, 'packages', 'adapter');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, 'package.json'), '{"name":"@test/adapter"}');

    const result = await discoverAdapters(tmpDir);
    expect(result.size).toBe(0);
  });

  it('discovers adapter with createAdapter export', async () => {
    const pkgDir = path.join(tmpDir, 'packages', 'my-adapter');
    const distDir = path.join(pkgDir, 'dist');
    await fs.mkdir(distDir, { recursive: true });

    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@test/my-adapter', main: 'dist/index.js' }),
    );

    await fs.writeFile(
      path.join(distDir, 'index.js'),
      'export function createAdapter(config) { return { type: "test", config }; }\n',
    );

    await writeLock(tmpDir, {
      '@test/my-adapter': {
        version: '1.0.0',
        integrity: 'sha256-abc',
        resolvedPath: './packages/my-adapter',
        installedAt: new Date().toISOString(),
        source: 'local',
        primaryKind: 'adapter',
        provides: ['adapter'],
      },
    });

    const result = await discoverAdapters(tmpDir);
    expect(result.size).toBe(1);
    expect(result.has('@test/my-adapter')).toBe(true);

    const adapter = result.get('@test/my-adapter')!;
    expect(typeof adapter.createAdapter).toBe('function');
    expect(adapter.packageName).toBe('@test/my-adapter');

    const instance = adapter.createAdapter({ key: 'value' });
    expect(instance.type).toBe('test');
    expect(instance.config.key).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeLock(root: string, installed: Record<string, any>): Promise<void> {
  const lockDir = path.join(root, '.kb');
  await fs.mkdir(lockDir, { recursive: true });
  await fs.writeFile(
    path.join(lockDir, 'marketplace.lock'),
    JSON.stringify({ schema: 'kb.marketplace/2', installed }, null, 2),
  );
}
