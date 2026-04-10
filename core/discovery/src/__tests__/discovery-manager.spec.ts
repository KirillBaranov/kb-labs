import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DiscoveryManager } from '../discovery-manager.js';
import { writeMarketplaceLock, createEmptyLock, createMarketplaceEntry } from '../marketplace-lock.js';

describe('DiscoveryManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-discovery-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty result when no lock file exists', async () => {
    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toEqual([]);
    expect(result.manifests.size).toBe(0);
    expect(result.diagnostics.some(d => d.code === 'LOCK_NOT_FOUND')).toBe(true);
  });

  it('returns empty result when lock has no entries', async () => {
    await writeMarketplaceLock(tmpDir, createEmptyLock());

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toEqual([]);
    expect(result.manifests.size).toBe(0);
  });

  it('reports PACKAGE_NOT_FOUND when resolvedPath does not exist', async () => {
    const lock = createEmptyLock();
    lock.installed['@kb-labs/ghost'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: 'sha256-abc',
      resolvedPath: './nonexistent',
      source: 'marketplace',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toEqual([]);
    const pkgNotFound = result.diagnostics.find(d => d.code === 'PACKAGE_NOT_FOUND');
    expect(pkgNotFound).toBeDefined();
    expect(pkgNotFound!.context?.pluginId).toBe('@kb-labs/ghost');
    expect(pkgNotFound!.remediation).toContain('install');
  });

  it('discovers plugin with kb.plugin.json', async () => {
    // Create a fake plugin directory with kb.plugin.json
    const pluginDir = path.join(tmpDir, 'plugins', 'test-plugin');
    await fs.mkdir(pluginDir, { recursive: true });

    const manifest = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/test-plugin',
      version: '1.2.3',
      display: { name: 'Test Plugin', description: 'A test' },
      cli: { commands: [{ id: 'hello', describe: 'Say hi', handler: './dist/hello.js' }] },
    };
    await fs.writeFile(path.join(pluginDir, 'kb.plugin.json'), JSON.stringify(manifest), 'utf-8');
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/test-plugin', version: '1.2.3',
    }), 'utf-8');

    // Compute integrity
    const pkgContent = await fs.readFile(path.join(pluginDir, 'package.json'));
    const integrity = `sha256-${crypto.createHash('sha256').update(pkgContent).digest('base64')}`;

    // Write lock
    const lock = createEmptyLock();
    lock.installed['@kb-labs/test-plugin'] = createMarketplaceEntry({
      version: '1.2.3',
      integrity,
      resolvedPath: './plugins/test-plugin',
      source: 'local',
      primaryKind: 'plugin',
      provides: ['plugin', 'cli-command'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.id).toBe('@kb-labs/test-plugin');
    expect(result.plugins[0]!.version).toBe('1.2.3');
    expect(result.plugins[0]!.source.kind).toBe('local');
    expect(result.plugins[0]!.display?.name).toBe('Test Plugin');
    expect(result.plugins[0]!.provides).toContain('cli-command');

    expect(result.manifests.has('@kb-labs/test-plugin')).toBe(true);
    expect(result.manifests.get('@kb-labs/test-plugin')!.cli?.commands).toHaveLength(1);
  });

  it('reports INTEGRITY_MISMATCH when hash does not match', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'bad-hash');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/bad-hash', version: '1.0.0',
    }), 'utf-8');
    await fs.writeFile(path.join(pluginDir, 'kb.plugin.json'), JSON.stringify({
      schema: 'kb.plugin/3', id: '@kb-labs/bad-hash', version: '1.0.0',
    }), 'utf-8');

    const lock = createEmptyLock();
    lock.installed['@kb-labs/bad-hash'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: 'sha256-WRONG_HASH',
      resolvedPath: './plugins/bad-hash',
      source: 'marketplace',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    expect(result.plugins).toEqual([]);
    const mismatch = result.diagnostics.find(d => d.code === 'INTEGRITY_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('error');
  });

  it('skips integrity check when verifyIntegrity is false', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'no-verify');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/no-verify', version: '1.0.0',
    }), 'utf-8');
    await fs.writeFile(path.join(pluginDir, 'kb.plugin.json'), JSON.stringify({
      schema: 'kb.plugin/3', id: '@kb-labs/no-verify', version: '1.0.0',
    }), 'utf-8');

    const lock = createEmptyLock();
    lock.installed['@kb-labs/no-verify'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: 'sha256-WRONG',
      resolvedPath: './plugins/no-verify',
      source: 'marketplace',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: false });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
  });

  it('reports SIGNATURE_MISSING as info when plugin has no signature', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'unsigned');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/unsigned', version: '1.0.0',
    }), 'utf-8');
    await fs.writeFile(path.join(pluginDir, 'kb.plugin.json'), JSON.stringify({
      schema: 'kb.plugin/3', id: '@kb-labs/unsigned', version: '1.0.0',
    }), 'utf-8');

    const pkgContent = await fs.readFile(path.join(pluginDir, 'package.json'));
    const integrity = `sha256-${crypto.createHash('sha256').update(pkgContent).digest('base64')}`;

    const lock = createEmptyLock();
    lock.installed['@kb-labs/unsigned'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity,
      resolvedPath: './plugins/unsigned',
      source: 'marketplace',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    const sigMissing = result.diagnostics.find(d => d.code === 'SIGNATURE_MISSING');
    expect(sigMissing).toBeDefined();
    expect(sigMissing!.severity).toBe('info');
  });

  it('detects duplicate plugin IDs', async () => {
    // Two lock entries that resolve to manifests with the same ID
    const dir1 = path.join(tmpDir, 'plugins', 'dup1');
    const dir2 = path.join(tmpDir, 'plugins', 'dup2');
    for (const dir of [dir1, dir2]) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: path.basename(dir), version: '1.0.0',
      }), 'utf-8');
      // Both manifests have the same ID
      await fs.writeFile(path.join(dir, 'kb.plugin.json'), JSON.stringify({
        schema: 'kb.plugin/3', id: '@kb-labs/same-id', version: '1.0.0',
      }), 'utf-8');
    }

    const lock = createEmptyLock();
    for (const [name, dir] of [['dup1', dir1], ['dup2', dir2]] as const) {
      const pkgContent = await fs.readFile(path.join(dir, 'package.json'));
      const integrity = `sha256-${crypto.createHash('sha256').update(pkgContent).digest('base64')}`;
      lock.installed[name] = createMarketplaceEntry({
        version: '1.0.0', integrity,
        resolvedPath: `./plugins/${name}`, source: 'local', primaryKind: 'plugin', provides: ['plugin'],
      });
    }
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    // First one wins, second gets ENTITY_CONFLICT
    expect(result.plugins).toHaveLength(1);
    const conflict = result.diagnostics.find(d => d.code === 'ENTITY_CONFLICT');
    expect(conflict).toBeDefined();
  });
});
