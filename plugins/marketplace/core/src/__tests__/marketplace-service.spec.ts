/**
 * Tests for MarketplaceService — the unified install/uninstall/link/sync/doctor API.
 *
 * Strategy: mock PackageSource + real filesystem (tmpDir).
 * We don't mock core-discovery — we use real lock files and kb.plugin.json.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { PackageSource, InstalledPackage, ResolvedPackage } from '@kb-labs/marketplace-contracts';
import { readMarketplaceLock, DiagnosticCollector } from '@kb-labs/core-discovery';
import { MarketplaceService, mergeScopedEntries } from '../marketplace-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeIntegrity(content: string): string {
  return `sha256-${crypto.createHash('sha256').update(Buffer.from(content)).digest('base64')}`;
}

async function createPluginDir(
  tmpDir: string,
  name: string,
  id: string,
  version = '1.0.0',
): Promise<{ dir: string; integrity: string }> {
  const dir = path.join(tmpDir, 'packages', name);
  await fs.mkdir(dir, { recursive: true });

  const pkgJson = JSON.stringify({ name: id, version });
  await fs.writeFile(path.join(dir, 'package.json'), pkgJson);
  await fs.writeFile(
    path.join(dir, 'kb.plugin.json'),
    JSON.stringify({
      schema: 'kb.plugin/3',
      id,
      version,
      cli: { commands: [{ id: 'hello', describe: 'hi', handler: './h.js' }] },
    }),
  );

  return { dir, integrity: computeIntegrity(pkgJson) };
}

function createMockSource(pluginDirs: Map<string, { dir: string; version: string; integrity: string }>): PackageSource {
  return {
    async resolve(spec: string): Promise<ResolvedPackage> {
      const info = pluginDirs.get(spec);
      if (!info) { throw new Error(`Package not found: ${spec}`); }
      return {
        id: spec,
        version: info.version,
        integrity: info.integrity,
        source: 'marketplace',
      };
    },
    async install(pkg: ResolvedPackage, _root: string): Promise<InstalledPackage> {
      const info = pluginDirs.get(pkg.id);
      if (!info) { throw new Error(`Package not found: ${pkg.id}`); }
      return {
        id: pkg.id,
        version: pkg.version,
        packageRoot: info.dir,
        integrity: pkg.integrity,
      };
    },
    async remove(_packageId: string, _root: string): Promise<void> {
      // noop in tests
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketplaceService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-marketplace-svc-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── install ──────────────────────────────────────────────────────────

  describe('install', () => {
    it('installs a plugin and writes to marketplace.lock', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'test-plugin', '@kb-labs/test-plugin');
      const source = createMockSource(
        new Map([['@kb-labs/test-plugin', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      const result = await service.install({ scope: "platform" }, ['@kb-labs/test-plugin']);

      expect(result.installed).toHaveLength(1);
      expect(result.installed[0]!.id).toBe('@kb-labs/test-plugin');
      expect(result.installed[0]!.version).toBe('1.0.0');
      expect(result.installed[0]!.primaryKind).toBe('plugin');
      expect(result.installed[0]!.provides).toContain('plugin');
      expect(result.installed[0]!.provides).toContain('cli-command');
      expect(result.warnings).toHaveLength(0);

      // Verify lock file
      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock).not.toBeNull();
      expect(lock!.installed['@kb-labs/test-plugin']).toBeDefined();
      expect(lock!.installed['@kb-labs/test-plugin']!.version).toBe('1.0.0');
      expect(lock!.installed['@kb-labs/test-plugin']!.source).toBe('marketplace');
    });

    it('installs multiple plugins in one call', async () => {
      const { dir: dir1, integrity: int1 } = await createPluginDir(tmpDir, 'a', '@kb-labs/a');
      const { dir: dir2, integrity: int2 } = await createPluginDir(tmpDir, 'b', '@kb-labs/b', '2.0.0');
      const source = createMockSource(new Map([
        ['@kb-labs/a', { dir: dir1, version: '1.0.0', integrity: int1 }],
        ['@kb-labs/b', { dir: dir2, version: '2.0.0', integrity: int2 }],
      ]));

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      const result = await service.install({ scope: "platform" }, ['@kb-labs/a', '@kb-labs/b']);

      expect(result.installed).toHaveLength(2);
      expect(result.installed.map(e => e.id).sort()).toEqual(['@kb-labs/a', '@kb-labs/b']);

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(Object.keys(lock!.installed)).toHaveLength(2);
    });

    it('catches afterInstall hook errors as warnings', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'hook-fail', '@kb-labs/hook-fail');
      const source = createMockSource(
        new Map([['@kb-labs/hook-fail', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      // Register a strategy with a failing afterInstall hook
      service.registerStrategy({
        kind: 'plugin',
        async detectKind() { return 'plugin'; },
        async extractProvides() { return ['plugin']; },
        async afterInstall() { throw new Error('hook-boom'); },
      });

      const result = await service.install({ scope: "platform" }, ['@kb-labs/hook-fail']);

      expect(result.installed).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('hook-boom');
    });
  });

  // ── uninstall ────────────────────────────────────────────────────────

  describe('uninstall', () => {
    it('removes plugin from lock and cache', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'to-remove', '@kb-labs/to-remove');
      const removeSpy = vi.fn();
      const source: PackageSource = {
        ...createMockSource(new Map([['@kb-labs/to-remove', { dir, version: '1.0.0', integrity }]])),
        remove: removeSpy,
      };

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/to-remove']);

      // Verify installed
      let lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/to-remove']).toBeDefined();

      // Uninstall
      await service.uninstall({ scope: "platform" }, ['@kb-labs/to-remove']);

      lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/to-remove']).toBeUndefined();
      expect(removeSpy).toHaveBeenCalledWith('@kb-labs/to-remove', tmpDir);
    });

    it('uninstalls multiple plugins', async () => {
      const { dir: d1, integrity: i1 } = await createPluginDir(tmpDir, 'x', '@kb-labs/x');
      const { dir: d2, integrity: i2 } = await createPluginDir(tmpDir, 'y', '@kb-labs/y');
      const source = createMockSource(new Map([
        ['@kb-labs/x', { dir: d1, version: '1.0.0', integrity: i1 }],
        ['@kb-labs/y', { dir: d2, version: '1.0.0', integrity: i2 }],
      ]));

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/x', '@kb-labs/y']);
      await service.uninstall({ scope: "platform" }, ['@kb-labs/x', '@kb-labs/y']);

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(Object.keys(lock!.installed)).toHaveLength(0);
    });
  });

  // ── link / unlink ────────────────────────────────────────────────────

  describe('link', () => {
    it('links a local plugin directory', async () => {
      const { dir } = await createPluginDir(tmpDir, 'local-plugin', '@kb-labs/local-plugin');
      const source = createMockSource(new Map());

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      const result = await service.link({ scope: "platform" }, path.relative(tmpDir, dir));

      expect(result.id).toBe('@kb-labs/local-plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.primaryKind).toBe('plugin');
      expect(result.provides).toContain('cli-command');

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/local-plugin']).toBeDefined();
      expect(lock!.installed['@kb-labs/local-plugin']!.source).toBe('local');
    });

    it('rejects path outside workspace root (path traversal)', async () => {
      const source = createMockSource(new Map());
      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      await expect(service.link({ scope: "platform" }, '../../etc/passwd')).rejects.toThrow('outside platform root');
    });
  });

  describe('unlink', () => {
    it('removes linked plugin from lock', async () => {
      const { dir } = await createPluginDir(tmpDir, 'to-unlink', '@kb-labs/to-unlink');
      const source = createMockSource(new Map());

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.link({ scope: "platform" }, path.relative(tmpDir, dir));
      await service.unlink({ scope: "platform" }, '@kb-labs/to-unlink');

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/to-unlink']).toBeUndefined();
    });
  });

  // ── enable / disable ─────────────────────────────────────────────────

  describe('enable / disable', () => {
    it('enables a disabled plugin', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'toggle', '@kb-labs/toggle');
      const source = createMockSource(
        new Map([['@kb-labs/toggle', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/toggle']);

      await service.disable({ scope: "platform" }, '@kb-labs/toggle');
      let lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/toggle']!.enabled).toBe(false);

      await service.enable({ scope: "platform" }, '@kb-labs/toggle');
      lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/toggle']!.enabled).toBe(true);
    });

    it('throws when enabling a non-existent package', async () => {
      const source = createMockSource(new Map());
      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      await expect(service.enable({ scope: "platform" }, '@kb-labs/ghost')).rejects.toThrow('not found');
    });

    it('throws when disabling a non-existent package', async () => {
      const source = createMockSource(new Map());
      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      await expect(service.disable({ scope: "platform" }, '@kb-labs/ghost')).rejects.toThrow('not found');
    });
  });

  // ── list / getEntry ──────────────────────────────────────────────────

  describe('list / getEntry', () => {
    it('lists installed plugins', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'listed', '@kb-labs/listed');
      const source = createMockSource(
        new Map([['@kb-labs/listed', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/listed']);

      const list = await service.list({ scope: "platform" });
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('@kb-labs/listed');
    });

    it('filters by kind', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'filter-me', '@kb-labs/filter-me');
      const source = createMockSource(
        new Map([['@kb-labs/filter-me', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/filter-me']);

      const plugins = await service.list({ scope: "platform" }, { kind: 'plugin' });
      expect(plugins).toHaveLength(1);

      const adapters = await service.list({ scope: "platform" }, { kind: 'adapter' });
      expect(adapters).toHaveLength(0);
    });

    it('returns empty list when no lock file', async () => {
      const source = createMockSource(new Map());
      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      const list = await service.list({ scope: "platform" });
      expect(list).toEqual([]);
    });

    it('getEntry returns entry or null', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'entry-get', '@kb-labs/entry-get');
      const source = createMockSource(
        new Map([['@kb-labs/entry-get', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/entry-get']);

      const entry = await service.getEntry({ scope: "platform" }, '@kb-labs/entry-get');
      expect(entry).not.toBeNull();
      expect(entry!.version).toBe('1.0.0');

      const missing = await service.getEntry({ scope: "platform" }, '@kb-labs/ghost');
      expect(missing).toBeNull();
    });
  });

  // ── doctor ───────────────────────────────────────────────────────────

  describe('doctor', () => {
    it('returns ok: true when all packages are healthy', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'healthy', '@kb-labs/healthy');
      const source = createMockSource(
        new Map([['@kb-labs/healthy', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/healthy']);

      const report = await service.doctor({ scope: "platform" });
      expect(report.ok).toBe(true);
      expect(report.total).toBe(1);
      // Info about missing signature is expected
      const errors = report.issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('reports error when package directory is missing', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'will-vanish', '@kb-labs/will-vanish');
      const source = createMockSource(
        new Map([['@kb-labs/will-vanish', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/will-vanish']);

      // Delete the package directory
      await fs.rm(dir, { recursive: true, force: true });

      const report = await service.doctor({ scope: "platform" });
      expect(report.ok).toBe(false);
      const error = report.issues.find(i => i.severity === 'error');
      expect(error).toBeDefined();
      expect(error!.message).toContain('not found');
    });

    it('warns about integrity mismatch', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'tampered', '@kb-labs/tampered');
      const source = createMockSource(
        new Map([['@kb-labs/tampered', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/tampered']);

      // Tamper with package.json
      await fs.writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: '@kb-labs/tampered', version: '1.0.0', tampered: true }),
      );

      const report = await service.doctor({ scope: "platform" });
      const warning = report.issues.find(i => i.severity === 'warning' && i.message.includes('Integrity'));
      expect(warning).toBeDefined();
    });

    it('reports info about unsigned packages', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'unsigned', '@kb-labs/unsigned');
      const source = createMockSource(
        new Map([['@kb-labs/unsigned', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/unsigned']);

      const report = await service.doctor({ scope: "platform" });
      const info = report.issues.find(i => i.severity === 'info' && i.message.includes('not signed'));
      expect(info).toBeDefined();
    });

    it('returns ok: true with empty lock', async () => {
      const source = createMockSource(new Map());
      const service = new MarketplaceService({ platformRoot: tmpDir, source });

      const report = await service.doctor({ scope: "platform" });
      expect(report.ok).toBe(true);
    });
  });

  // ── sync ─────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('discovers plugins from glob patterns', async () => {
      await createPluginDir(tmpDir, 'found-plugin', '@kb-labs/found-plugin');
      const source = createMockSource(new Map());

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      const result = await service.sync({ scope: "platform" }, {
        include: ['packages/*'],
      });

      expect(result.added).toHaveLength(1);
      expect(result.added[0]!.id).toBe('@kb-labs/found-plugin');
      expect(result.total).toBe(1);

      // Verify lock file updated
      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/found-plugin']).toBeDefined();
    });

    it('skips packages already in lock', async () => {
      const { dir, integrity } = await createPluginDir(tmpDir, 'existing', '@kb-labs/existing');
      const source = createMockSource(
        new Map([['@kb-labs/existing', { dir, version: '1.0.0', integrity }]]),
      );

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.install({ scope: "platform" }, ['@kb-labs/existing']);

      const result = await service.sync({ scope: "platform" }, { include: ['packages/*'] });
      expect(result.added).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]!.reason).toContain('already in lock');
    });

    it('marks new entries as disabled by default', async () => {
      await createPluginDir(tmpDir, 'auto-disabled', '@kb-labs/auto-disabled');
      const source = createMockSource(new Map());

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.sync({ scope: "platform" }, { include: ['packages/*'], autoEnable: false });

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/auto-disabled']!.enabled).toBe(false);
    });

    it('auto-enables entries when autoEnable is true', async () => {
      await createPluginDir(tmpDir, 'auto-enabled', '@kb-labs/auto-enabled');
      const source = createMockSource(new Map());

      const service = new MarketplaceService({ platformRoot: tmpDir, source });
      await service.sync({ scope: "platform" }, { include: ['packages/*'], autoEnable: true });

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/auto-enabled']!.enabled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// mergeScopedEntries — project wins over platform
// ---------------------------------------------------------------------------

function makeEntry(id: string, version: string): { id: string; version: string; resolvedPath: string; installedAt: string; source: 'marketplace'; primaryKind: 'plugin'; provides: string[]; integrity: string } {
  return {
    id,
    version,
    resolvedPath: `./node_modules/${id}`,
    installedAt: new Date().toISOString(),
    source: 'marketplace',
    primaryKind: 'plugin',
    provides: ['plugin'],
    integrity: 'sha256-test',
  };
}

describe('mergeScopedEntries — project wins', () => {
  it('returns platform-only entries unchanged', () => {
    const { entries, diagnostics } = mergeScopedEntries([
      { scope: 'platform', entries: [makeEntry('@kb/a', '1.0.0')] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('@kb/a');
    expect(entries[0]!.scope).toBe('platform');
    expect(diagnostics).toHaveLength(0);
  });

  it('returns project-only entries unchanged', () => {
    const { entries, diagnostics } = mergeScopedEntries([
      { scope: 'project', entries: [makeEntry('@kb/b', '2.0.0')] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.scope).toBe('project');
    expect(diagnostics).toHaveLength(0);
  });

  it('merges non-overlapping entries from both scopes', () => {
    const { entries, diagnostics } = mergeScopedEntries([
      { scope: 'platform', entries: [makeEntry('@kb/platform-only', '1.0.0')] },
      { scope: 'project',  entries: [makeEntry('@kb/project-only',  '2.0.0')] },
    ]);
    expect(entries).toHaveLength(2);
    expect(diagnostics).toHaveLength(0);
  });

  it('project entry wins on collision and emits diagnostic', () => {
    const { entries, diagnostics } = mergeScopedEntries([
      { scope: 'platform', entries: [makeEntry('@kb/shared', '1.0.0')] },
      { scope: 'project',  entries: [makeEntry('@kb/shared', '2.0.0')] },
    ]);

    expect(entries).toHaveLength(1);
    const winner = entries[0]!;
    expect(winner.id).toBe('@kb/shared');
    expect(winner.version).toBe('2.0.0');    // project version
    expect(winner.scope).toBe('project');

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('MARKETPLACE_SCOPE_COLLISION');
    expect(diagnostics[0]!.message).toContain('project wins');
  });

  it('project wins regardless of input order', () => {
    // Project entries listed before platform
    const { entries: r1 } = mergeScopedEntries([
      { scope: 'project',  entries: [makeEntry('@kb/shared', '2.0.0')] },
      { scope: 'platform', entries: [makeEntry('@kb/shared', '1.0.0')] },
    ]);
    expect(r1[0]!.version).toBe('2.0.0');
    expect(r1[0]!.scope).toBe('project');

    // Platform entries listed before project
    const { entries: r2 } = mergeScopedEntries([
      { scope: 'platform', entries: [makeEntry('@kb/shared', '1.0.0')] },
      { scope: 'project',  entries: [makeEntry('@kb/shared', '2.0.0')] },
    ]);
    expect(r2[0]!.version).toBe('2.0.0');
    expect(r2[0]!.scope).toBe('project');
  });
});
