import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DiscoveryManager } from '../discovery-manager.js';
import {
  writeMarketplaceLock,
  readMarketplaceLock,
  createEmptyLock,
  createMarketplaceEntry,
} from '../marketplace-lock.js';
import { DiagnosticCollector } from '../diagnostics.js';

describe('DiscoveryManager — disabled plugins', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-discovery-disabled-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createPlugin(name: string, id: string) {
    const pluginDir = path.join(tmpDir, 'plugins', name);
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id, version: '1.0.0' }),
    );
    const pkgJson = JSON.stringify({ name: id, version: '1.0.0' });
    await fs.writeFile(path.join(pluginDir, 'package.json'), pkgJson);
    const integrity = `sha256-${crypto.createHash('sha256').update(Buffer.from(pkgJson)).digest('base64')}`;
    return { pluginDir, integrity };
  }

  it('skips disabled plugins and emits PLUGIN_DISABLED diagnostic', async () => {
    const { integrity } = await createPlugin('my-plugin', '@kb-labs/my-plugin');

    const lock = createEmptyLock();
    lock.installed['@kb-labs/my-plugin'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity,
      resolvedPath: './plugins/my-plugin',
      source: 'local',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    lock.installed['@kb-labs/my-plugin']!.enabled = false;
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(0);
    const disabled = result.diagnostics.find(d => d.code === 'PLUGIN_DISABLED');
    expect(disabled).toBeDefined();
    expect(disabled!.severity).toBe('info');
    expect(disabled!.message).toContain('@kb-labs/my-plugin');
  });

  it('discovers enabled plugins alongside disabled ones', async () => {
    const { integrity: intA } = await createPlugin('enabled-one', '@kb-labs/enabled-one');
    const { integrity: intB } = await createPlugin('disabled-one', '@kb-labs/disabled-one');

    const lock = createEmptyLock();
    lock.installed['@kb-labs/enabled-one'] = createMarketplaceEntry({
      version: '1.0.0', integrity: intA,
      resolvedPath: './plugins/enabled-one', source: 'local',
      primaryKind: 'plugin', provides: ['plugin'],
    });
    lock.installed['@kb-labs/disabled-one'] = createMarketplaceEntry({
      version: '1.0.0', integrity: intB,
      resolvedPath: './plugins/disabled-one', source: 'local',
      primaryKind: 'plugin', provides: ['plugin'],
    });
    lock.installed['@kb-labs/disabled-one']!.enabled = false;
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.id).toBe('@kb-labs/enabled-one');
  });
});

describe('DiscoveryManager — local integrity refresh', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-discovery-refresh-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-refreshes integrity for local packages when hash changes', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'local-pkg');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id: '@kb-labs/local-pkg', version: '1.0.0' }),
    );
    // Original package.json
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/local-pkg', version: '1.0.0',
    }));

    const oldIntegrity = 'sha256-OLD_STALE_HASH';

    const lock = createEmptyLock();
    lock.installed['@kb-labs/local-pkg'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: oldIntegrity,
      resolvedPath: './plugins/local-pkg',
      source: 'local',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    // Plugin should still be discovered (local = non-blocking refresh)
    expect(result.plugins).toHaveLength(1);

    // Lock should be updated with new integrity
    const updatedLock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
    expect(updatedLock).not.toBeNull();
    const entry = updatedLock!.installed['@kb-labs/local-pkg']!;
    expect(entry.integrity).not.toBe(oldIntegrity);
    expect(entry.integrity).toMatch(/^sha256-/);

    // Should have INTEGRITY_REFRESHED diagnostic
    const refreshed = result.diagnostics.find(d => d.code === 'INTEGRITY_REFRESHED');
    expect(refreshed).toBeDefined();
  });

  it('does not update lock when local package integrity matches', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'matching');
    await fs.mkdir(pluginDir, { recursive: true });
    const pkgJson = JSON.stringify({ name: '@kb-labs/matching', version: '1.0.0' });
    await fs.writeFile(path.join(pluginDir, 'package.json'), pkgJson);
    await fs.writeFile(
      path.join(pluginDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id: '@kb-labs/matching', version: '1.0.0' }),
    );

    const correctIntegrity = `sha256-${crypto.createHash('sha256').update(Buffer.from(pkgJson)).digest('base64')}`;

    const lock = createEmptyLock();
    lock.installed['@kb-labs/matching'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: correctIntegrity,
      resolvedPath: './plugins/matching',
      source: 'local',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    // No refresh diagnostic since integrity already matches
    const refreshed = result.diagnostics.find(d => d.code === 'INTEGRITY_REFRESHED');
    expect(refreshed).toBeUndefined();
  });

  it('blocks marketplace packages with wrong integrity (not local)', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'remote-bad');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: '@kb-labs/remote-bad', version: '1.0.0',
    }));
    await fs.writeFile(
      path.join(pluginDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id: '@kb-labs/remote-bad', version: '1.0.0' }),
    );

    const lock = createEmptyLock();
    lock.installed['@kb-labs/remote-bad'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity: 'sha256-WRONG',
      resolvedPath: './plugins/remote-bad',
      source: 'marketplace', // NOT local → integrity mismatch blocks
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    // Marketplace package blocked
    expect(result.plugins).toHaveLength(0);
    const mismatch = result.diagnostics.find(d => d.code === 'INTEGRITY_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('error');
  });

  it('warns about manifest ID mismatch but still discovers', async () => {
    const pluginDir = path.join(tmpDir, 'plugins', 'id-mismatch');
    await fs.mkdir(pluginDir, { recursive: true });
    const pkgJson = JSON.stringify({ name: '@kb-labs/id-mismatch', version: '1.0.0' });
    await fs.writeFile(path.join(pluginDir, 'package.json'), pkgJson);
    // Manifest has a DIFFERENT ID from the lock entry
    await fs.writeFile(
      path.join(pluginDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id: '@kb-labs/actual-id', version: '1.0.0' }),
    );

    const integrity = `sha256-${crypto.createHash('sha256').update(Buffer.from(pkgJson)).digest('base64')}`;

    const lock = createEmptyLock();
    lock.installed['@kb-labs/id-mismatch'] = createMarketplaceEntry({
      version: '1.0.0',
      integrity,
      resolvedPath: './plugins/id-mismatch',
      source: 'local',
      primaryKind: 'plugin',
      provides: ['plugin'],
    });
    await writeMarketplaceLock(tmpDir, lock);

    const dm = new DiscoveryManager({ root: tmpDir });
    const result = await dm.discover();

    // Should still discover, using manifest's own ID
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.id).toBe('@kb-labs/actual-id');

    // Should warn about mismatch
    const warning = result.diagnostics.find(d => d.code === 'MANIFEST_VALIDATION_ERROR');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
    expect(warning!.message).toContain('does not match');
  });
});
