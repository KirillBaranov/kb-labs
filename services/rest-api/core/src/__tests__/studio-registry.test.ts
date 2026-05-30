import { describe, it, expect } from 'vitest';
import { manifestToRegistryEntry, combineManifestsToRegistry } from '../studio-registry';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

function makeManifest(overrides: Partial<ManifestV3> = {}): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: '@kb-labs/test-plugin',
    version: '1.0.0',
    ...overrides,
  };
}

describe('manifestToRegistryEntry', () => {
  it('returns null for manifest without studio config', () => {
    const result = manifestToRegistryEntry(makeManifest(), '/some/path');
    expect(result).toBeNull();
  });

  it('returns null for manifest with non-v2 studio config', () => {
    const result = manifestToRegistryEntry(
      makeManifest({ studio: { widgets: [], layouts: [] } as any }),
      '/some/path',
    );
    expect(result).toBeNull();
  });

  it('returns entry for valid V2 studio config', () => {
    const entry = manifestToRegistryEntry(
      makeManifest({
        id: '@kb-labs/commit',
        version: '2.0.0',
        display: { name: 'Commit Plugin' },
        studio: {
          version: 2,
          remoteName: 'commitPlugin',
          pages: [
            { id: 'commit.overview', title: 'Commit', route: '/p/commit', entry: './CommitOverview' },
          ],
          menus: [
            { id: 'commit', label: 'Commit', icon: 'GitlabOutlined', target: 'commit.overview' },
          ],
        },
      }),
      '/workspace/plugins/kb-labs-commit-plugin/packages/commit-cli',
    );

    expect(entry).not.toBeNull();
    expect(entry!.pluginId).toBe('@kb-labs/commit');
    expect(entry!.remoteName).toBe('commitPlugin');
    expect(entry!.remoteEntryUrl).toMatch(/^\/plugins\/@kb-labs\/commit\/widgets\/remoteEntry\.js/);
    expect(entry!.widgetBundleDir).toBe('/workspace/plugins/kb-labs-commit-plugin/packages/commit-cli/dist/widgets');
    expect(entry!.pages).toHaveLength(1);
    expect(entry!.menus).toHaveLength(1);
  });
});

describe('combineManifestsToRegistry', () => {
  it('returns empty registry for no manifests', () => {
    const registry = combineManifestsToRegistry([]);
    expect(registry.schema).toBe('kb.studio/2');
    expect(registry.schemaVersion).toBe(2);
    expect(registry.plugins).toHaveLength(0);
  });

  it('skips manifests without V2 studio config', () => {
    const registry = combineManifestsToRegistry([
      { manifest: makeManifest(), pluginRoot: '/a' },
      { manifest: makeManifest({ id: '@kb-labs/no-studio' }), pluginRoot: '/b' },
    ]);
    expect(registry.plugins).toHaveLength(0);
  });

  it('generates remoteEntryUrl matching gateway route pattern', () => {
    const registry = combineManifestsToRegistry([{
      manifest: makeManifest({
        id: '@kb-labs/commit',
        studio: {
          version: 2,
          remoteName: 'commitPlugin',
          pages: [{ id: 'c.o', title: 'C', route: '/p/commit', entry: './C' }],
        },
      }),
      pluginRoot: '/workspace/plugins/commit-cli',
    }]);

    const entry = registry.plugins[0]!;
    const match = entry.remoteEntryUrl.match(/^\/plugins\/@([^/]+)\/([^/]+)\/widgets\/remoteEntry\.js/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('kb-labs');
    expect(match![2]).toBe('commit');
  });

  it('computes widgetBundleDir from pluginRoot', () => {
    const registry = combineManifestsToRegistry([{
      manifest: makeManifest({
        id: '@kb-labs/commit',
        studio: {
          version: 2,
          remoteName: 'commitPlugin',
          pages: [{ id: 'c.o', title: 'C', route: '/p/commit', entry: './C' }],
        },
      }),
      pluginRoot: '/opt/kb-labs/plugins/commit-cli',
    }]);

    expect(registry.plugins[0]!.widgetBundleDir).toBe('/opt/kb-labs/plugins/commit-cli/dist/widgets');
  });

  it('combines multiple V2 manifests', () => {
    const registry = combineManifestsToRegistry([
      {
        manifest: makeManifest({
          id: '@kb-labs/commit',
          studio: { version: 2, remoteName: 'commitPlugin', pages: [{ id: 'c', title: 'C', route: '/p/c', entry: './C' }] },
        }),
        pluginRoot: '/a',
      },
      {
        manifest: makeManifest({
          id: '@kb-labs/quality',
          studio: { version: 2, remoteName: 'qualityPlugin', pages: [{ id: 'q', title: 'Q', route: '/p/q', entry: './Q' }] },
        }),
        pluginRoot: '/b',
      },
    ]);

    expect(registry.plugins).toHaveLength(2);
    expect(registry.plugins[0]!.pluginId).toBe('@kb-labs/commit');
    expect(registry.plugins[1]!.pluginId).toBe('@kb-labs/quality');
  });
});
