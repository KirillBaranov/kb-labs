/**
 * Collision Detection Tests
 *
 * Tests that system commands always win over plugin commands
 * and that malicious plugins cannot escape the sandbox.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrieBackedRegistry } from '../service';
import type { RegisteredCommand } from '../types';
import type { Command as SystemCommand, CommandGroup as SystemGroup } from '@kb-labs/shared-command-kit';

// Helper to create a fresh registry per test
function makeRegistry() {
  return new TrieBackedRegistry();
}

function makeSystemCmd(name: string, aliases: string[] = []): SystemCommand {
  return {
    name,
    describe: `System command: ${name}`,
    category: 'system',
    aliases,
    async run() { return 0; },
  };
}

function makePlugin(
  group: string,
  id: string,
  aliases?: string[],
): RegisteredCommand {
  const segments = group ? [group, id] : [id];
  return {
    manifest: {
      manifestVersion: '1.0',
      segments,
      id,
      group,
      describe: `Plugin: ${id}`,
      aliases,
      loader: async () => ({ run: async () => 1 }),
    },
    available: true,
    source: 'workspace',
    shadowed: false,
  };
}

describe('Collision Detection', () => {
  it('should prevent plugin from overriding system command with same canonical ID', () => {
    const reg = makeRegistry();

    // Register system group 'test' with command 'test-cmd' at path ['test', 'test-cmd']
    const group: SystemGroup = { name: 'test', describe: 'Test', commands: [makeSystemCmd('test-cmd')] };
    reg.registerGroup(group);

    // Try to register plugin with same canonical path
    const pluginCmd = makePlugin('test', 'test-cmd');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reg.registerManifest(pluginCmd);
    warnSpy.mockRestore();

    // Plugin is marked as shadowed
    expect(pluginCmd.shadowed).toBe(true);

    // Routing returns system command
    const result = reg.resolve(['test', 'test-cmd']);
    expect(result.type).toBe('system-cmd');
  });

  it('should NOT shadow plugin when only bare id matches system command', () => {
    const reg = makeRegistry();

    // System command "test-cmd" (bare, no group)
    const systemCmd = makeSystemCmd('test-cmd');
    reg.register(systemCmd);

    // Plugin canonical path is ['test', 'test-cmd'] — different from ['test-cmd']
    const pluginCmd = makePlugin('test', 'test-cmd');
    reg.registerManifest(pluginCmd);

    // Plugin should NOT be shadowed — different path
    expect(pluginCmd.shadowed).toBe(false);

    // System command still resolves
    const sysResult = reg.resolve(['test-cmd']);
    expect(sysResult.type).toBe('system-cmd');

    // Plugin also resolves
    const pluginResult = reg.resolve(['test', 'test-cmd']);
    expect(pluginResult.type).toBe('command');
  });

  it('should prevent plugin alias from overriding system command', () => {
    const reg = makeRegistry();

    // 1. Register system command with alias 'sc'
    const systemCmd = makeSystemCmd('sys-cmd', ['sc']);
    reg.register(systemCmd);

    // 2. Try to register plugin with alias 'sc' — collision
    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        segments: ['test', 'plugin-cmd'],
        id: 'plugin-cmd',
        group: 'test',
        describe: 'Plugin with colliding alias',
        aliases: ['sc'],
        loader: async () => ({ run: async () => 1 }),
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reg.registerManifest(pluginCmd);
    warnSpy.mockRestore();

    // 3. System command still resolves via alias
    const result = reg.resolve(['sc']);
    expect(result.type).toBe('system-cmd');
    if (result.type === 'system-cmd') {
      expect(result.cmd).toBe(systemCmd);
    }
  });

  it('should route system commands to in-process execution', () => {
    const reg = makeRegistry();

    // Register system group
    const group: SystemGroup = {
      name: 'info',
      describe: 'Info commands',
      commands: [
        makeSystemCmd('hello'),
      ],
    };
    reg.registerGroup(group);

    // Verify routing
    const result = reg.resolve(['info', 'hello']);
    expect(result.type).toBe('system-cmd');
    if (result.type === 'system-cmd') {
      expect(result.cmd).toHaveProperty('run');
    }
  });

  it('should route plugin commands to subprocess execution', () => {
    const reg = makeRegistry();

    const pluginCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        segments: ['custom', 'my-plugin'],
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
                path: 'custom my-plugin',
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
    reg.registerManifest(pluginCmd);

    const result = reg.resolve(['custom', 'my-plugin']);
    expect(result.type).toBe('command');
  });

  it('should handle CommandGroup routing', () => {
    const reg = makeRegistry();

    const group: SystemGroup = {
      name: 'plugins',
      describe: 'Plugin management',
      commands: [makeSystemCmd('list')],
    };
    reg.registerGroup(group);

    // Verify group routing
    const result = reg.resolve(['plugins']);
    expect(result.type).toBe('system-group');
    if (result.type === 'system-group') {
      expect(result.group).toHaveProperty('commands');
    }
  });

  it('shadowed plugin is not routed to', () => {
    const reg = makeRegistry();

    // System group 'security' with command 'auth' at path ['security', 'auth']
    const group: SystemGroup = { name: 'security', describe: 'Security', commands: [makeSystemCmd('auth')] };
    reg.registerGroup(group);

    const pluginCmd = makePlugin('security', 'auth');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reg.registerManifest(pluginCmd);
    warnSpy.mockRestore();

    // Plugin is marked as shadowed
    expect(pluginCmd.shadowed).toBe(true);

    // Routing goes to system command
    const result = reg.resolve(['security', 'auth']);
    expect(result.type).toBe('system-cmd');
  });
});
