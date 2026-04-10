/**
 * Tests for manifest registration with shadowing logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerManifests } from '../register';
import type { DiscoveryResult, CommandManifest } from '../types';

// Mock dependencies
vi.mock('../availability.js', () => ({
  checkRequires: vi.fn(),
}));

// Logger mock removed - using cli-core logger abstraction directly

describe('registerManifests', () => {
  const mockRegistry = {
    registerManifest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register manifests with availability check', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const manifests: CommandManifest[] = [{
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    }];

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests,
    }];

    const result = await registerManifests(discoveryResults, mockRegistry as any);

    expect(result.registered).toHaveLength(1);
    const registered = result.registered[0]!;
    expect(registered.available).toBe(true);
    expect(registered.source).toBe('workspace');
    expect(result.skipped).toHaveLength(0);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(registered);
  });

  it('should handle unavailable commands with reason and hint', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({
      available: false,
      reason: "Missing dependency: @kb-labs/missing-package",
      hint: "Run: pnpm add @kb-labs/missing-package",
    });

    const manifests: CommandManifest[] = [{
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/missing-package'],
      loader: async () => ({ run: async () => 0 }),
    }];

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests,
    }];

    const result = await registerManifests(discoveryResults, mockRegistry as any);

    expect(result.registered).toHaveLength(1);
    const registered = result.registered[0]!;
    expect(registered.available).toBe(false);
    expect(registered.unavailableReason).toBe(
      "Missing dependency: @kb-labs/missing-package",
    );
    expect(registered.hint).toBe("Run: pnpm add @kb-labs/missing-package");
    expect(result.skipped).toHaveLength(0);
  });

  it('should handle shadowing: workspace shadows node_modules', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const workspaceManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Workspace command',
      loader: async () => ({ run: async () => 0 }),
    };

    const nodeModulesManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Node modules command',
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults: DiscoveryResult[] = [
      {
        source: 'node_modules',
        packageName: '@kb-labs/node-package',
        manifestPath: '/test/node-manifest.js',
        pkgRoot: '/test/node-package',
        manifests: [nodeModulesManifest],
      },
      {
        source: 'workspace',
        packageName: '@kb-labs/workspace-package',
        manifestPath: '/test/workspace-manifest.js',
        pkgRoot: '/test/workspace-package',
        manifests: [workspaceManifest],
      },
    ];

    const result = await registerManifests(discoveryResults, mockRegistry as any);

    expect(result.registered).toHaveLength(1);
    const workspaceCmd = result.registered[0]!;
    expect(workspaceCmd.source).toBe("workspace");
    expect(workspaceCmd.shadowed).toBe(false);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(workspaceCmd);
  });

  it('should validate manifest schema', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const invalidManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      // Missing required loader
    } as any;

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests: [invalidManifest],
    }];

    const result = await registerManifests(discoveryResults, mockRegistry as any);

    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.id).toBe('test:command');
    expect(mockRegistry.registerManifest).not.toHaveBeenCalled();
  });

  it('should validate flag definitions', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const manifestWithInvalidFlag: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      flags: [{
        name: 'test-flag',
        type: 'string',
        alias: 'invalid-alias', // Invalid: should be single letter
      }],
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests: [manifestWithInvalidFlag],
    }];

    const result = await registerManifests(discoveryResults, mockRegistry as any);

    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.id).toBe('test:command');
    expect(mockRegistry.registerManifest).not.toHaveBeenCalled();
  });
});
