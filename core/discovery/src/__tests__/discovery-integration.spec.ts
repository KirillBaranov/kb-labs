/**
 * Integration test: marketplace install → discovery → plugin available
 *
 * Tests the real flow:
 *   1. Create fake plugin on disk with kb.plugin.json
 *   2. Write marketplace.lock with correct integrity
 *   3. Run DiscoveryManager.discover()
 *   4. Verify plugin is found with correct metadata
 *
 * No mocking — uses real filesystem, real lock files, real discovery.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DiscoveryManager } from '../discovery-manager.js';
import {
  writeMarketplaceLock,
  createEmptyLock,
  createMarketplaceEntry,
} from '../marketplace-lock.js';

describe('Discovery Integration: install → discover → available', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-discovery-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function computeIntegrity(content: string): string {
    return `sha256-${crypto.createHash('sha256').update(Buffer.from(content)).digest('base64')}`;
  }

  async function installPlugin(opts: {
    name: string;
    id: string;
    version: string;
    commands?: Array<{ id: string; describe: string }>;
    routes?: Array<{ method: string; path: string }>;
    workflows?: Array<{ id: string }>;
  }) {
    const pluginDir = path.join(tmpDir, 'plugins', opts.name);
    await fs.mkdir(pluginDir, { recursive: true });

    const pkgJson = JSON.stringify({ name: opts.id, version: opts.version });
    await fs.writeFile(path.join(pluginDir, 'package.json'), pkgJson);

    const manifest: Record<string, unknown> = {
      schema: 'kb.plugin/3',
      id: opts.id,
      version: opts.version,
      display: { name: opts.name, description: `${opts.name} plugin` },
    };
    if (opts.commands?.length) {
      manifest.cli = { commands: opts.commands.map(c => ({ ...c, handler: './dist/h.js' })) };
    }
    if (opts.routes?.length) {
      manifest.rest = { routes: opts.routes.map(r => ({ ...r, handler: './dist/r.js' })) };
    }
    if (opts.workflows?.length) {
      manifest.workflows = { handlers: opts.workflows };
    }

    await fs.writeFile(path.join(pluginDir, 'kb.plugin.json'), JSON.stringify(manifest));

    return {
      dir: pluginDir,
      integrity: computeIntegrity(pkgJson),
      relPath: `./plugins/${opts.name}`,
    };
  }

  it('discovers a single CLI plugin end-to-end', async () => {
    const { integrity, relPath } = await installPlugin({
      name: 'commit',
      id: '@kb-labs/commit',
      version: '1.5.0',
      commands: [{ id: 'commit', describe: 'AI commit message' }],
    });

    const lock = createEmptyLock();
    lock.installed['@kb-labs/commit'] = createMarketplaceEntry({
      version: '1.5.0',
      integrity,
      resolvedPath: relPath,
      source: 'marketplace',
      primaryKind: 'plugin',
      provides: ['plugin', 'cli-command'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    const plugin = result.plugins[0]!;
    expect(plugin.id).toBe('@kb-labs/commit');
    expect(plugin.version).toBe('1.5.0');
    expect(plugin.source.kind).toBe('marketplace');
    expect(plugin.provides).toContain('plugin');
    expect(plugin.provides).toContain('cli-command');
    expect(plugin.display?.name).toBe('commit');

    // Manifest should be loaded
    const manifest = result.manifests.get('@kb-labs/commit');
    expect(manifest).toBeDefined();
    expect(manifest!.cli?.commands).toHaveLength(1);
  });

  it('discovers multiple plugins with different entity kinds', async () => {
    const commit = await installPlugin({
      name: 'commit',
      id: '@kb-labs/commit',
      version: '1.0.0',
      commands: [{ id: 'commit', describe: 'Commit' }],
    });

    const api = await installPlugin({
      name: 'rest-api',
      id: '@kb-labs/rest-api',
      version: '2.0.0',
      routes: [{ method: 'GET', path: '/api/status' }],
    });

    const workflow = await installPlugin({
      name: 'deploy',
      id: '@kb-labs/deploy',
      version: '0.5.0',
      workflows: [{ id: 'deploy-prod' }],
    });

    const lock = createEmptyLock();
    for (const { id, version, integrity, relPath, provides } of [
      { ...commit, id: '@kb-labs/commit', version: '1.0.0', provides: ['plugin', 'cli-command'] },
      { ...api, id: '@kb-labs/rest-api', version: '2.0.0', provides: ['plugin', 'rest-route'] },
      { ...workflow, id: '@kb-labs/deploy', version: '0.5.0', provides: ['plugin', 'workflow'] },
    ]) {
      lock.installed[id] = createMarketplaceEntry({
        version, integrity, resolvedPath: relPath,
        source: 'local', primaryKind: 'plugin', provides,
      });
    }
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(3);
    expect(result.manifests.size).toBe(3);

    // Verify entity kinds extracted from manifests
    const commitPlugin = result.plugins.find(p => p.id === '@kb-labs/commit')!;
    expect(commitPlugin.provides).toContain('cli-command');

    const apiPlugin = result.plugins.find(p => p.id === '@kb-labs/rest-api')!;
    expect(apiPlugin.provides).toContain('rest-route');

    const deployPlugin = result.plugins.find(p => p.id === '@kb-labs/deploy')!;
    expect(deployPlugin.provides).toContain('workflow');
  });

  it('installed → disabled → not discovered → enabled → discovered', async () => {
    const { integrity, relPath } = await installPlugin({
      name: 'toggle-test',
      id: '@kb-labs/toggle',
      version: '1.0.0',
      commands: [{ id: 'toggle', describe: 'Toggle test' }],
    });

    // Install as disabled
    const lock = createEmptyLock();
    lock.installed['@kb-labs/toggle'] = createMarketplaceEntry({
      version: '1.0.0', integrity, resolvedPath: relPath,
      source: 'local', primaryKind: 'plugin', provides: ['plugin'],
    });
    lock.installed['@kb-labs/toggle']!.enabled = false;
    await writeMarketplaceLock(tmpDir, lock);

    // Discovery should skip
    const dm = new DiscoveryManager({ root: tmpDir });
    let result = await dm.discover();
    expect(result.plugins).toHaveLength(0);

    // Enable
    lock.installed['@kb-labs/toggle']!.enabled = true;
    await writeMarketplaceLock(tmpDir, lock);

    // Discovery should find
    result = await dm.discover();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.id).toBe('@kb-labs/toggle');
  });

  it('tampered package is blocked (integrity mismatch)', async () => {
    const { relPath } = await installPlugin({
      name: 'tampered',
      id: '@kb-labs/tampered',
      version: '1.0.0',
    });

    // Install with wrong integrity
    const lock = createEmptyLock();
    lock.installed['@kb-labs/tampered'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: 'sha256-WRONG_HASH',
      resolvedPath: relPath,
      source: 'marketplace', // marketplace = strict integrity check
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    // Should be blocked
    expect(result.plugins).toHaveLength(0);
    const mismatch = result.diagnostics.find(d => d.code === 'INTEGRITY_MISMATCH');
    expect(mismatch).toBeDefined();
  });

  it('removed package directory produces PACKAGE_NOT_FOUND diagnostic', async () => {
    const { integrity } = await installPlugin({
      name: 'vanished',
      id: '@kb-labs/vanished',
      version: '1.0.0',
    });

    const lock = createEmptyLock();
    lock.installed['@kb-labs/vanished'] = createMarketplaceEntry({
      version: '1.0.0', integrity,
      resolvedPath: './plugins/vanished',
      source: 'local', primaryKind: 'plugin', provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    // Delete the plugin directory
    await fs.rm(path.join(tmpDir, 'plugins', 'vanished'), { recursive: true });

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(0);
    const notFound = result.diagnostics.find(d => d.code === 'PACKAGE_NOT_FOUND');
    expect(notFound).toBeDefined();
    expect(notFound!.remediation).toContain('install');
  });

  it('no lock file produces empty result with diagnostic', async () => {
    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(0);
    expect(result.manifests.size).toBe(0);
    expect(result.diagnostics.some(d => d.code === 'LOCK_NOT_FOUND')).toBe(true);
  });
});
