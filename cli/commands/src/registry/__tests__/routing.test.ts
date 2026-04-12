/**
 * Registry Routing Tests
 *
 * Covers canonical ID strategy, alias resolution, collision handling,
 * and all command path variants (bare, group:id, group:subgroup:id).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registry, findCommandWithType } from '../service';
import type { Command, CommandGroup } from '../legacy-types';
import type { RegisteredCommand } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSystemCmd(name: string, aliases: string[] = []): Command {
  return {
    name,
    describe: `System command: ${name}`,
    category: 'system',
    aliases,
    async run() { return 0; },
  };
}

function makeSystemGroup(name: string, commands: string[]): CommandGroup {
  return {
    name,
    describe: `Group: ${name}`,
    commands: commands.map(c => makeSystemCmd(c)),
  };
}

function makePlugin(
  id: string,
  group: string,
  subgroup?: string,
  aliases?: string[],
): RegisteredCommand {
  return {
    manifest: {
      manifestVersion: '1.0',
      id,
      group,
      subgroup,
      aliases,
      describe: `Plugin: ${id}`,
      loader: async () => ({ run: async () => 0 }),
    },
    available: true,
    source: 'workspace',
    shadowed: false,
  };
}

function resetRegistry() {
  (registry as any).systemCommands = new Map();
  (registry as any).pluginByCanonical = new Map();
  (registry as any).pluginAliases = new Map();
  (registry as any).byName = new Map();
  (registry as any).groups = new Map();
  (registry as any).manifests = new Map();
  (registry as any).partial = false;
}

// ─── Canonical ID Strategy ────────────────────────────────────────────────────

describe('Canonical ID Strategy', () => {
  beforeEach(resetRegistry);

  it('bare plugin (no group): canonical = id', () => {
    const plugin = makePlugin('my-tool', '');
    registry.registerManifest(plugin);

    const result = findCommandWithType('my-tool');
    expect(result?.type).toBe('plugin');
  });

  it('2-part plugin (group:id): canonical = group:id', () => {
    const plugin = makePlugin('list', 'marketplace');
    registry.registerManifest(plugin);

    // Must be reachable via canonical
    expect(findCommandWithType('marketplace:list')?.type).toBe('plugin');
    // Also via space form
    expect(findCommandWithType('marketplace list')?.type).toBe('plugin');
  });

  it('3-part plugin (group:subgroup:id): canonical = group:subgroup:id', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    // Full canonical
    expect(findCommandWithType('marketplace:plugins:list')?.type).toBe('plugin');
    // Space form
    expect(findCommandWithType('marketplace plugins list')?.type).toBe('plugin');
  });
});

// ─── 2-Part Shorthand for 3-Part Commands ────────────────────────────────────

describe('2-Part Shorthand for 3-Part Commands', () => {
  beforeEach(resetRegistry);

  it('resolves "group:id" when command is group:subgroup:id (unambiguous)', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const result = findCommandWithType('marketplace:list');
    expect(result?.type).toBe('plugin');
  });

  it('resolves "group id" space form as shorthand', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const result = findCommandWithType('marketplace list');
    expect(result?.type).toBe('plugin');
  });

  it('array path ["marketplace", "list"] resolves via shorthand', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const result = findCommandWithType(['marketplace', 'list']);
    expect(result?.type).toBe('plugin');
  });

  it('getManifestCommand resolves via 2-part shorthand', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const cmd = registry.getManifestCommand('marketplace:list');
    expect(cmd).toBe(plugin);
  });

  it('getManifestCommand resolves via full canonical', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const cmd = registry.getManifestCommand('marketplace:plugins:list');
    expect(cmd).toBe(plugin);
  });
});

// ─── User-Defined Aliases ─────────────────────────────────────────────────────

describe('User-Defined Aliases', () => {
  beforeEach(resetRegistry);

  it('resolves manifest aliases to the correct plugin', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins', ['mp:list', 'mpl']);
    registry.registerManifest(plugin);

    expect(findCommandWithType('mp:list')?.type).toBe('plugin');
    expect(findCommandWithType('mpl')?.type).toBe('plugin');
  });

  it('getManifestCommand resolves by alias', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins', ['mpl']);
    registry.registerManifest(plugin);

    const cmd = registry.getManifestCommand('mpl');
    expect(cmd).toBe(plugin);
  });
});

// ─── Collision: System Always Wins ───────────────────────────────────────────

describe('Collision: System Always Wins', () => {
  beforeEach(resetRegistry);

  it('system command beats plugin with same bare id', () => {
    const sys = makeSystemCmd('auth');
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('auth', 'security');
    registry.registerManifest(plugin);

    expect(plugin.shadowed).toBe(true);
    expect(findCommandWithType('auth')?.type).toBe('system');
    expect(findCommandWithType('auth')?.cmd).toBe(sys);
    warnSpy.mockRestore();
  });

  it('system command beats plugin with same canonical id', () => {
    const sys = makeSystemCmd('marketplace:list');
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('list', 'marketplace');
    registry.registerManifest(plugin);

    expect(plugin.shadowed).toBe(true);
    expect(findCommandWithType('marketplace:list')?.type).toBe('system');
    warnSpy.mockRestore();
  });

  it('system group beats plugin with same name', () => {
    const group = makeSystemGroup('marketplace', ['list', 'install']);
    registry.registerGroup(group);

    const result = findCommandWithType('marketplace');
    expect(result?.type).toBe('system');
    expect(result?.cmd).toHaveProperty('commands');
  });

  it('logs warning when plugin collides with system command', () => {
    const sys = makeSystemCmd('protected');
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('protected', 'test');
    registry.registerManifest(plugin);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collides with system command'));
    warnSpy.mockRestore();
  });

  it('shadowed plugin is stored in manifests for listing but not routed', () => {
    const sys = makeSystemCmd('deploy');
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('deploy', 'infra');
    registry.registerManifest(plugin);

    // Listed in manifests
    const manifests = registry.listManifests();
    expect(manifests).toContainEqual(plugin);

    // But not routed
    expect(findCommandWithType('deploy')?.type).toBe('system');
    warnSpy.mockRestore();
  });

  it('plugin alias that collides with system command is blocked', () => {
    const sys = makeSystemCmd('sys-cmd', ['sc']);
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('plugin-cmd', 'test', undefined, ['sc']);
    registry.registerManifest(plugin);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"sc" collides with system command'));
    // alias 'sc' still routes to system
    expect(findCommandWithType('sc')?.type).toBe('system');
    expect(findCommandWithType('sc')?.cmd).toBe(sys);
    warnSpy.mockRestore();
  });

  it('shadowed plugin does NOT appear in byName map under its id', () => {
    const sys = makeSystemCmd('version');
    registry.register(sys);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = makePlugin('version', 'core');
    registry.registerManifest(plugin);

    const byNameValue = (registry as any).byName.get('version');
    expect(byNameValue).toBe(sys);
    warnSpy.mockRestore();
  });
});

// ─── Group Routing ────────────────────────────────────────────────────────────

describe('Group Routing', () => {
  beforeEach(resetRegistry);

  it('registered group returns type=system', () => {
    const group = makeSystemGroup('plugins', ['list', 'install']);
    registry.registerGroup(group);

    const result = findCommandWithType('plugins');
    expect(result?.type).toBe('system');
    expect(result?.cmd).toHaveProperty('commands');
  });

  it('subcommand within group resolves to system', () => {
    const group = makeSystemGroup('info', ['hello', 'version']);
    registry.registerGroup(group);

    expect(findCommandWithType(['info', 'hello'])?.type).toBe('system');
    expect(findCommandWithType('info hello')?.type).toBe('system');
  });

  it('synthetic plugin subgroup is created for help display', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const groups = registry.listGroups();
    const subgroup = groups.find(g => g.name === 'marketplace plugins');
    expect(subgroup).toBeDefined();
    expect(subgroup?.commands.length).toBeGreaterThan(0);
  });
});

// ─── Multi-Plugin Registration ────────────────────────────────────────────────

describe('Multiple Plugins in Same Group', () => {
  beforeEach(resetRegistry);

  it('registers multiple commands under same group:subgroup', () => {
    const list = makePlugin('list', 'marketplace', 'plugins');
    const install = makePlugin('install', 'marketplace', 'plugins');
    registry.registerManifest(list);
    registry.registerManifest(install);

    expect(findCommandWithType('marketplace:plugins:list')?.type).toBe('plugin');
    expect(findCommandWithType('marketplace:plugins:install')?.type).toBe('plugin');
  });

  it('listManifests returns all unique plugins', () => {
    const list = makePlugin('list', 'marketplace', 'plugins');
    const install = makePlugin('install', 'marketplace', 'plugins');
    registry.registerManifest(list);
    registry.registerManifest(install);

    const manifests = registry.listManifests();
    expect(manifests).toHaveLength(2);
    expect(manifests).toContainEqual(list);
    expect(manifests).toContainEqual(install);
  });

  it('getCommandsByGroup returns commands in that group', () => {
    const list = makePlugin('list', 'marketplace', 'plugins');
    const install = makePlugin('install', 'marketplace', 'plugins');
    registry.registerManifest(list);
    registry.registerManifest(install);

    const cmds = registry.getCommandsByGroup('marketplace');
    expect(cmds).toHaveLength(2);
  });
});

// ─── Colon ↔ Space Equivalence ───────────────────────────────────────────────

describe('Colon ↔ Space Equivalence', () => {
  beforeEach(resetRegistry);

  it('colon and space are equivalent for 2-part plugin', () => {
    const plugin = makePlugin('list', 'marketplace');
    registry.registerManifest(plugin);

    expect(findCommandWithType('marketplace:list')?.type).toBe('plugin');
    expect(findCommandWithType('marketplace list')?.type).toBe('plugin');
    expect(findCommandWithType(['marketplace', 'list'])?.type).toBe('plugin');
  });

  it('colon and space are equivalent for 3-part plugin', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    expect(findCommandWithType('marketplace:plugins:list')?.type).toBe('plugin');
    expect(findCommandWithType('marketplace plugins list')?.type).toBe('plugin');
    expect(findCommandWithType(['marketplace', 'plugins', 'list'])?.type).toBe('plugin');
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  beforeEach(resetRegistry);

  it('returns undefined for unknown command', () => {
    const result = findCommandWithType('non-existent-command');
    expect(result).toBeUndefined();
  });

  it('has() returns true for registered plugin', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    expect(registry.has('marketplace:plugins:list')).toBe(true);
    expect(registry.has('marketplace:list')).toBe(true);
  });

  it('has() returns false for unknown command', () => {
    expect(registry.has('totally-unknown')).toBe(false);
  });

  it('listManifests returns no duplicates for multiply-keyed commands', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    const manifests = registry.listManifests();
    const seen = new Set(manifests);
    expect(seen.size).toBe(manifests.length);
  });

  it('getManifest retrieves by bare id', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    expect(registry.getManifest('list')).toBe(plugin);
  });

  it('getManifest retrieves by canonical id', () => {
    const plugin = makePlugin('list', 'marketplace', 'plugins');
    registry.registerManifest(plugin);

    expect(registry.getManifest('marketplace:plugins:list')).toBe(plugin);
  });
});
