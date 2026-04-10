/**
 * Tests for V3 manifest field in RegisteredCommand
 *
 * Tests that v3Manifest field is properly populated and accessible
 * in RegisteredCommand, replacing the confusing manifestV2 field.
 */

import { describe, it, expect } from 'vitest';
import type { RegisteredCommand, CommandManifest } from '../types';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

describe('V3 Manifest Field', () => {
  it('should have v3Manifest field in RegisteredCommand type', () => {
    const mockV3Manifest: ManifestV3 = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/test-plugin',
      version: '1.0.0',
      cli: {
        commands: [
          {
            id: 'test:command',
            describe: 'Test command',
            handler: 'dist/commands/test.js',
          },
        ],
      },
      permissions: {
        shell: {
          allow: ['git', 'cd'],
        },
      },
    };

    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    };

    // Type check: v3Manifest should be optional ManifestV3
    const command: RegisteredCommand = {
      manifest: mockManifest,
      v3Manifest: mockV3Manifest,
      available: true,
      source: 'workspace',
      shadowed: false,
      pkgRoot: '/test',
      packageName: '@kb-labs/test',
    };

    expect(command.v3Manifest).toBeDefined();
    expect(command.v3Manifest?.id).toBe('@kb-labs/test-plugin');
    expect(command.v3Manifest?.cli?.commands).toHaveLength(1);
    expect(command.v3Manifest?.permissions?.shell?.allow).toContain('git');
  });

  it('should allow v3Manifest to be undefined for system commands', () => {
    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'system:hello',
      group: 'system',
      describe: 'Hello command',
      loader: async () => ({ run: async () => 0 }),
    };

    // Type check: v3Manifest can be undefined
    const command: RegisteredCommand = {
      manifest: mockManifest,
      v3Manifest: undefined,
      available: true,
      source: 'builtin',
      shadowed: false,
    };

    expect(command.v3Manifest).toBeUndefined();
  });

  it('should preserve backward compatibility with manifestV2', () => {
    const mockV3Manifest: ManifestV3 = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/test-plugin',
      version: '1.0.0',
    };

    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    };

    // Simulate legacy code that still uses manifestV2
    (mockManifest as any).manifestV2 = mockV3Manifest;

    const command: RegisteredCommand = {
      manifest: mockManifest,
      v3Manifest: (mockManifest as any).manifestV2, // Extract from legacy field
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    expect(command.v3Manifest).toBe(mockV3Manifest);
    expect((command.manifest as any).manifestV2).toBe(mockV3Manifest);
  });

  it('should provide clean access to shell permissions via v3Manifest', () => {
    const mockV3Manifest: ManifestV3 = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/release-manager',
      version: '1.0.0',
      permissions: {
        shell: {
          allow: ['git', 'cd', 'npm'],
        },
        fs: {
          read: ['package.json'],
          write: ['CHANGELOG.md'],
        },
      },
    };

    const command: RegisteredCommand = {
      manifest: {} as CommandManifest,
      v3Manifest: mockV3Manifest,
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    // Clean access without any type assertions
    const shellPermissions = command.v3Manifest?.permissions?.shell;
    expect(shellPermissions?.allow).toEqual(['git', 'cd', 'npm']);

    const fsPermissions = command.v3Manifest?.permissions?.fs;
    expect(fsPermissions?.read).toEqual(['package.json']);
    expect(fsPermissions?.write).toEqual(['CHANGELOG.md']);
  });

  it('should handle fallback from v3Manifest to manifestV2', () => {
    const mockV3Manifest: ManifestV3 = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/test',
      version: '1.0.0',
      cli: {
        commands: [{ id: 'test', describe: 'Test', handler: 'dist/test.js' }],
      },
    };

    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test',
      group: 'test',
      describe: 'Test',
      loader: async () => ({ run: async () => 0 }),
    };

    (mockManifest as any).manifestV2 = mockV3Manifest;

    // Simulate plugin-executor.ts logic
    const command: RegisteredCommand = {
      manifest: mockManifest,
      // v3Manifest not set in this case
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    // Fallback logic
    const v3Manifest = command.v3Manifest ?? (command.manifest as any).manifestV2;

    expect(v3Manifest).toBe(mockV3Manifest);
    expect(v3Manifest.id).toBe('@kb-labs/test');
  });
});
