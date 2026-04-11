/**
 * Integration test: marketplace install → discovery → plugin available
 *
 * Full lifecycle:
 *   1. MarketplaceService.install() writes lock + cache
 *   2. DiscoveryManager.discover() reads lock + loads manifests
 *   3. Plugin is available with correct entity kinds
 *
 * No mocking of discovery or marketplace internals — real filesystem.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DiscoveryManager } from '@kb-labs/core-discovery';
import type { PackageSource, InstalledPackage, ResolvedPackage } from '@kb-labs/marketplace-contracts';
import { MarketplaceService } from '../marketplace-service.js';

describe('Marketplace → Discovery Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-mkt-disc-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function computeIntegrity(content: string): string {
    return `sha256-${crypto.createHash('sha256').update(Buffer.from(content)).digest('base64')}`;
  }

  async function createPluginOnDisk(name: string, id: string, version: string) {
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
        display: { name, description: `${name} plugin` },
        cli: { commands: [{ id: `${name}:run`, describe: `Run ${name}`, handler: './dist/h.js' }] },
      }),
    );

    return { dir, integrity: computeIntegrity(pkgJson) };
  }

  it('install → discover: plugin is available after marketplace install', async () => {
    const { dir, integrity } = await createPluginOnDisk('review', '@kb-labs/review', '2.0.0');

    // Step 1: Install via MarketplaceService
    const source: PackageSource = {
      async resolve(spec: string): Promise<ResolvedPackage> {
        return { id: spec, version: '2.0.0', integrity, source: 'marketplace' };
      },
      async install(pkg: ResolvedPackage): Promise<InstalledPackage> {
        return { id: pkg.id, version: pkg.version, packageRoot: dir, integrity: pkg.integrity };
      },
      async remove() {},
    };

    const marketplace = new MarketplaceService({ root: tmpDir, source });
    const installResult = await marketplace.install(['@kb-labs/review']);

    expect(installResult.installed).toHaveLength(1);
    expect(installResult.installed[0]!.id).toBe('@kb-labs/review');
    expect(installResult.installed[0]!.provides).toContain('cli-command');

    // Step 2: Discover via DiscoveryManager
    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: false });
    const discoverResult = await dm.discover();

    expect(discoverResult.plugins).toHaveLength(1);
    expect(discoverResult.plugins[0]!.id).toBe('@kb-labs/review');
    expect(discoverResult.plugins[0]!.version).toBe('2.0.0');
    expect(discoverResult.plugins[0]!.provides).toContain('cli-command');

    // Manifest should be fully loaded
    const manifest = discoverResult.manifests.get('@kb-labs/review');
    expect(manifest).toBeDefined();
    expect(manifest!.cli?.commands).toHaveLength(1);
    expect(manifest!.cli?.commands?.[0]?.id).toBe('review:run');
  });

  it('install → uninstall → discover: plugin is gone after uninstall', async () => {
    const { dir, integrity } = await createPluginOnDisk('temp', '@kb-labs/temp', '1.0.0');

    const source: PackageSource = {
      async resolve(spec: string): Promise<ResolvedPackage> {
        return { id: spec, version: '1.0.0', integrity, source: 'marketplace' };
      },
      async install(pkg: ResolvedPackage): Promise<InstalledPackage> {
        return { id: pkg.id, version: pkg.version, packageRoot: dir, integrity: pkg.integrity };
      },
      async remove() {},
    };

    const marketplace = new MarketplaceService({ root: tmpDir, source });
    await marketplace.install(['@kb-labs/temp']);

    // Verify installed
    let dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: false });
    let result = await dm.discover();
    expect(result.plugins).toHaveLength(1);

    // Uninstall
    await marketplace.uninstall(['@kb-labs/temp']);

    // Verify gone
    dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: false });
    result = await dm.discover();
    expect(result.plugins).toHaveLength(0);
  });

  it('install → disable → discover: disabled plugin not found', async () => {
    const { dir, integrity } = await createPluginOnDisk('optional', '@kb-labs/optional', '1.0.0');

    const source: PackageSource = {
      async resolve(spec: string): Promise<ResolvedPackage> {
        return { id: spec, version: '1.0.0', integrity, source: 'marketplace' };
      },
      async install(pkg: ResolvedPackage): Promise<InstalledPackage> {
        return { id: pkg.id, version: pkg.version, packageRoot: dir, integrity: pkg.integrity };
      },
      async remove() {},
    };

    const marketplace = new MarketplaceService({ root: tmpDir, source });
    await marketplace.install(['@kb-labs/optional']);

    // Disable
    await marketplace.disable('@kb-labs/optional');

    // Discovery should skip
    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: false });
    const result = await dm.discover();
    expect(result.plugins).toHaveLength(0);

    const disabled = result.diagnostics.find(d => d.code === 'PLUGIN_DISABLED');
    expect(disabled).toBeDefined();

    // Re-enable
    await marketplace.enable('@kb-labs/optional');

    const result2 = await dm.discover();
    expect(result2.plugins).toHaveLength(1);
  });

  it('link → discover: local linked plugin is available', async () => {
    await createPluginOnDisk('local-dev', '@kb-labs/local-dev', '0.0.1');

    const source: PackageSource = {
      async resolve(): Promise<ResolvedPackage> { throw new Error('unused'); },
      async install(): Promise<InstalledPackage> { throw new Error('unused'); },
      async remove() {},
    };

    const marketplace = new MarketplaceService({ root: tmpDir, source });
    const linkResult = await marketplace.link('packages/local-dev');

    expect(linkResult.id).toBe('@kb-labs/local-dev');
    expect(linkResult.primaryKind).toBe('plugin');

    // Discovery should find linked plugin
    const dm = new DiscoveryManager({ root: tmpDir, verifyIntegrity: true });
    const result = await dm.discover();

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.id).toBe('@kb-labs/local-dev');
    expect(result.plugins[0]!.source.kind).toBe('local');
  });
});
