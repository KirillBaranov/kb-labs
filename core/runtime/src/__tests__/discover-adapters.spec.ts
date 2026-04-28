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

    const instance = adapter.createAdapter({ key: 'value' }) as Record<string, unknown>;
    expect((instance as Record<string, unknown>).type).toBe('test');
    expect((instance.config as Record<string, unknown>).key).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// Two-root (prod mode): project wins over platform
// ---------------------------------------------------------------------------

describe('discoverAdapters — project wins over platform', () => {
  let platformRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    platformRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-'));
    projectRoot  = await fs.mkdtemp(path.join(os.tmpdir(), 'project-'));
  });

  afterEach(async () => {
    await fs.rm(platformRoot, { recursive: true, force: true });
    await fs.rm(projectRoot,  { recursive: true, force: true });
  });

  it('returns empty when neither root has a lock', async () => {
    const result = await discoverAdapters(platformRoot, projectRoot);
    expect(result.size).toBe(0);
  });

  it('returns platform-only adapters when project lock is absent', async () => {
    await buildAdapter(platformRoot, 'platform-adapter', '@test/platform-adapter', 'platform-v1');
    const result = await discoverAdapters(platformRoot, projectRoot);
    expect(result.size).toBe(1);
    const adapter = result.get('@test/platform-adapter')!;
    expect(adapter).toBeDefined();
    const instance = adapter.createAdapter({}) as Record<string, unknown>;
    expect(instance['source']).toBe('platform-v1');
  });

  it('returns project-only adapters when platform lock is absent', async () => {
    await buildAdapter(projectRoot, 'project-adapter', '@test/project-adapter', 'project-v1');
    const result = await discoverAdapters(platformRoot, projectRoot);
    expect(result.size).toBe(1);
    const adapter = result.get('@test/project-adapter')!;
    expect(adapter).toBeDefined();
    const instance = adapter.createAdapter({}) as Record<string, unknown>;
    expect(instance['source']).toBe('project-v1');
  });

  it('project adapter wins over platform adapter with same id', async () => {
    await buildAdapter(platformRoot, 'shared-adapter', '@test/shared-adapter', 'platform-version');
    await buildAdapter(projectRoot,  'shared-adapter', '@test/shared-adapter', 'project-version');

    const result = await discoverAdapters(platformRoot, projectRoot);
    expect(result.size).toBe(1);

    const adapter = result.get('@test/shared-adapter')!;
    expect(adapter).toBeDefined();
    const instance = adapter.createAdapter({}) as Record<string, unknown>;
    expect(instance['source']).toBe('project-version');
  });

  it('merges non-overlapping adapters from both roots', async () => {
    await buildAdapter(platformRoot, 'platform-only', '@test/platform-only', 'from-platform');
    await buildAdapter(projectRoot,  'project-only',  '@test/project-only',  'from-project');

    const result = await discoverAdapters(platformRoot, projectRoot);
    expect(result.size).toBe(2);
    expect(result.has('@test/platform-only')).toBe(true);
    expect(result.has('@test/project-only')).toBe(true);
  });

  it('behaves identically when projectRoot === platformRoot (dev mode)', async () => {
    await buildAdapter(platformRoot, 'dev-adapter', '@test/dev-adapter', 'dev');
    const result = await discoverAdapters(platformRoot, platformRoot);
    // Same root: should not double-load or error
    expect(result.size).toBe(1);
    expect(result.has('@test/dev-adapter')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeLock(root: string, installed: Record<string, unknown>): Promise<void> {
  const lockDir = path.join(root, '.kb');
  await fs.mkdir(lockDir, { recursive: true });
  await fs.writeFile(
    path.join(lockDir, 'marketplace.lock'),
    JSON.stringify({ schema: 'kb.marketplace/2', installed }, null, 2),
  );
}

/**
 * Creates a built adapter package + lock entry in `root`.
 * The adapter's `createAdapter` returns `{ source: tag }` so tests can identify
 * which root the loaded module came from.
 */
async function buildAdapter(
  root: string,
  pkgSlug: string,
  pkgName: string,
  tag: string,
): Promise<void> {
  const pkgDir  = path.join(root, 'packages', pkgSlug);
  const distDir = path.join(pkgDir, 'dist');
  await fs.mkdir(distDir, { recursive: true });

  await fs.writeFile(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: pkgName, main: 'dist/index.js' }),
  );
  await fs.writeFile(
    path.join(distDir, 'index.js'),
    `export function createAdapter() { return { source: "${tag}" }; }\n`,
  );

  await writeLock(root, {
    [pkgName]: {
      version: '1.0.0',
      integrity: 'sha256-test',
      resolvedPath: `./packages/${pkgSlug}`,
      installedAt: new Date().toISOString(),
      source: 'local',
      primaryKind: 'adapter',
      provides: ['adapter'],
    },
  });
}
