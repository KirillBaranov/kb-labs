/**
 * Collision Detection Tests
 *
 * Tests that system commands always win over plugin commands
 * and that malicious plugins cannot escape the sandbox.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registry, findCommandWithType } from '../service';
import type { Command, CommandGroup } from '../legacy-types';
import type { RegisteredCommand } from '../types';

describe('Collision Detection', () => {
  beforeEach(() => {
    // Clear registry before each test
    (registry as any).systemCommands = new Map();
    (registry as any).pluginCommands = new Map();
    (registry as any).byName = new Map();
    (registry as any).groups = new Map();
    (registry as any).manifests = new Map();
  });

  it('should prevent plugin from overriding system command', () => {
    // 1. Register system command first
    const systemCmd: Command = {
      name: 'test-cmd',
      describe: 'System command',
      category: 'system',
      aliases: [],
      async run() {
        return 0;
      },
    };
    registry.register(systemCmd);

    // 2. Try to register plugin with same ID
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test-cmd', // Same ID as system command
        group: 'test',
        describe: 'Malicious plugin trying to override',
        loader: async () => ({ run: async () => 1 }),
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.registerManifest(pluginCmd);

    // 3. Verify warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('collides with system command')
    );

    // 4. Verify plugin is marked as shadowed
    expect(pluginCmd.shadowed).toBe(true);

    // 5. Verify routing returns system command
    const result = findCommandWithType('test-cmd');
    expect(result).toBeDefined();
    expect(result?.type).toBe('system');
    expect(result?.cmd).toBe(systemCmd);

    warnSpy.mockRestore();
  });

  it('should prevent plugin alias from overriding system command', () => {
    // 1. Register system command
    const systemCmd: Command = {
      name: 'sys-cmd',
      describe: 'System command',
      category: 'system',
      aliases: ['sc'],
      async run() {
        return 0;
      },
    };
    registry.register(systemCmd);

    // 2. Try to register plugin with alias collision
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'plugin-cmd',
        group: 'test',
        describe: 'Plugin with colliding alias',
        aliases: ['sc'], // Collides with system command alias
        loader: async () => ({ run: async () => 1 }),
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.registerManifest(pluginCmd);

    // 3. Verify warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin alias "sc" collides with system command')
    );

    // 4. Verify routing via alias returns system command
    const result = findCommandWithType('sc');
    expect(result).toBeDefined();
    expect(result?.type).toBe('system');
    expect(result?.cmd).toBe(systemCmd);

    warnSpy.mockRestore();
  });

  it('should route system commands to in-process execution', () => {
    // Register system command via group
    const group: CommandGroup = {
      name: 'info',
      describe: 'Info commands',
      commands: [
        {
          name: 'hello',
          describe: 'Hello command',
          category: 'info',
          aliases: [],
          async run() {
            return 0;
          },
        },
      ],
    };
    registry.registerGroup(group);

    // Verify routing
    const result = findCommandWithType(['info', 'hello']);
    expect(result).toBeDefined();
    expect(result?.type).toBe('system');
    expect(result?.cmd).toHaveProperty('run');
  });

  it('should route plugin commands to subprocess execution', () => {
    // Register plugin command
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'my-plugin',
        group: 'custom',
        describe: 'Custom plugin',
        loader: async () => ({ run: async () => 0 }),
        manifestV2: {
          schema: 'kb.plugin/3' as const,
          id: '@kb-labs/my-plugin',
          version: '1.0.0',
          display: { name: 'My Plugin' },
          cli: {
            commands: [
              {
                id: 'my-plugin',
                describe: 'My plugin command',
                handler: './dist/handler.js',
              },
            ],
          },
        },
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };
    registry.registerManifest(pluginCmd);

    // Verify routing
    const result = findCommandWithType('my-plugin');
    expect(result).toBeDefined();
    expect(result?.type).toBe('plugin');
  });

  it('should handle CommandGroup routing', () => {
    // Register group
    const group: CommandGroup = {
      name: 'plugins',
      describe: 'Plugin management',
      commands: [
        {
          name: 'list',
          describe: 'List plugins',
          category: 'plugins',
          aliases: [],
          async run() {
            return 0;
          },
        },
      ],
    };
    registry.registerGroup(group);

    // Verify group routing
    const result = findCommandWithType('plugins');
    expect(result).toBeDefined();
    expect(result?.type).toBe('system');
    expect(result?.cmd).toHaveProperty('commands');
  });

  it('should not add colliding plugin to byName map', () => {
    // Register system command
    const systemCmd: Command = {
      name: 'protected',
      describe: 'Protected system command',
      category: 'system',
      aliases: [],
      async run() {
        return 0;
      },
    };
    registry.register(systemCmd);

    // Try to register plugin with same ID
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'protected',
        group: 'test',
        describe: 'Malicious plugin',
        loader: async () => ({ run: async () => 1 }),
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.registerManifest(pluginCmd);

    // Verify plugin is NOT in byName (only in manifests)
    const byNameResult = (registry as any).byName.get('protected');
    expect(byNameResult).toBe(systemCmd); // Should be system command, not plugin adapter

    // Verify plugin IS in manifests (for listing purposes)
    const manifestResult = registry.getManifest('protected');
    expect(manifestResult).toBe(pluginCmd);

    warnSpy.mockRestore();
  });

  it('should store shadowed plugins in manifests but not route to them', () => {
    // Register system command
    const systemCmd: Command = {
      name: 'auth',
      describe: 'Auth command',
      category: 'system',
      aliases: [],
      async run() {
        return 0;
      },
    };
    registry.register(systemCmd);

    // Register plugin with collision
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'auth',
        group: 'security',
        describe: 'Plugin auth (shadowed)',
        loader: async () => ({ run: async () => 1 }),
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.registerManifest(pluginCmd);

    // Verify plugin is in manifests list
    const manifests = registry.listManifests();
    expect(manifests).toContainEqual(pluginCmd);

    // Verify plugin is marked as shadowed
    expect(pluginCmd.shadowed).toBe(true);

    // Verify routing goes to system command
    const result = findCommandWithType('auth');
    expect(result?.type).toBe('system');

    warnSpy.mockRestore();
  });
});
