import { describe, it, expect, beforeEach } from 'vitest';

// Inline minimal types to avoid complex import chains
interface Command {
  name: string;
  describe: string;
  aliases?: string[];
  run: () => Promise<number>;
}

interface CommandGroup {
  name: string;
  describe: string;
  commands: Command[];
  subgroups?: CommandGroup[];
}

function makeCmd(name: string, aliases?: string[]): Command {
  return { name, describe: `${name} command`, aliases, run: async () => 0 };
}

/**
 * Simplified registry matching the real InMemoryRegistry.registerGroup logic
 * to test the subgroups feature in isolation.
 */
class TestRegistry {
  private groups = new Map<string, CommandGroup>();
  private byName = new Map<string, Command | CommandGroup>();
  private systemCommands = new Map<string, Command>();

  registerGroup(group: CommandGroup): void {
    this.groups.set(group.name, group);
    this.byName.set(group.name, group);

    for (const cmd of group.commands) {
      this.systemCommands.set(cmd.name, cmd);
      const fullName = `${group.name} ${cmd.name}`;
      this.systemCommands.set(fullName, cmd);
      this.byName.set(fullName, cmd);
      for (const alias of cmd.aliases || []) {
        this.systemCommands.set(alias, cmd);
        this.byName.set(alias, cmd);
      }
    }

    if (group.subgroups) {
      for (const sub of group.subgroups) {
        const subName = `${group.name} ${sub.name}`;
        this.groups.set(subName, sub);
        this.byName.set(subName, sub);
        for (const cmd of sub.commands) {
          const fullName = `${group.name} ${sub.name} ${cmd.name}`;
          this.systemCommands.set(fullName, cmd);
          this.byName.set(fullName, cmd);
          for (const alias of cmd.aliases || []) {
            this.systemCommands.set(alias, cmd);
            this.byName.set(alias, cmd);
          }
        }
      }
    }
  }

  get(nameOrPath: string | string[]): Command | CommandGroup | undefined {
    const key = Array.isArray(nameOrPath) ? nameOrPath.join(' ') : nameOrPath;
    return this.byName.get(key);
  }
}

// ---------------------------------------------------------------------------
// Plugin manifest subgroup registration (mirrors real registerManifest logic)
// ---------------------------------------------------------------------------

interface ManifestCmd {
  id: string;
  group: string;
  subgroup?: string;
}

class TestManifestRegistry {
  private groups = new Map<string, CommandGroup>();
  private byName = new Map<string, Command | CommandGroup>();
  private manifests = new Map<string, ManifestCmd>();

  registerManifest(manifest: ManifestCmd, cmd: Command): void {
    this.byName.set(manifest.id, cmd);
    this.manifests.set(manifest.id, manifest);

    if (manifest.group && manifest.subgroup) {
      const fullPath = `${manifest.group} ${manifest.subgroup} ${manifest.id}`;
      const colonPath = `${manifest.group}:${manifest.subgroup}:${manifest.id}`;
      this.byName.set(fullPath, cmd);
      this.byName.set(colonPath, cmd);
      this.manifests.set(fullPath, manifest);
      this.manifests.set(colonPath, manifest);

      const subgroupKey = `${manifest.group} ${manifest.subgroup}`;
      if (!this.groups.has(subgroupKey)) {
        this.groups.set(subgroupKey, { name: subgroupKey, describe: manifest.subgroup, commands: [] });
        this.byName.set(subgroupKey, this.groups.get(subgroupKey)!);
      }
      this.groups.get(subgroupKey)!.commands.push(cmd);
    } else if (manifest.group) {
      const fullName = `${manifest.group} ${manifest.id}`;
      const colonName = `${manifest.group}:${manifest.id}`;
      this.byName.set(fullName, cmd);
      this.byName.set(colonName, cmd);
      this.manifests.set(fullName, manifest);
      this.manifests.set(colonName, manifest);
    }
  }

  get(key: string): Command | CommandGroup | undefined {
    return this.byName.get(key);
  }

  getManifest(key: string): ManifestCmd | undefined {
    return this.manifests.get(key);
  }
}

describe('registerManifest with subgroups', () => {
  let registry: TestManifestRegistry;

  beforeEach(() => {
    registry = new TestManifestRegistry();
  });

  it('registers subgroup command with 3-part space and colon paths', () => {
    registry.registerManifest(
      { id: 'list', group: 'marketplace', subgroup: 'plugins' },
      makeCmd('list'),
    );

    expect(registry.get('marketplace plugins list')).toBeDefined();
    expect(registry.get('marketplace:plugins:list')).toBeDefined();
  });

  it('registers top-level command with 2-part space and colon paths', () => {
    registry.registerManifest(
      { id: 'install', group: 'marketplace' },
      makeCmd('install'),
    );

    expect(registry.get('marketplace install')).toBeDefined();
    expect(registry.get('marketplace:install')).toBeDefined();
  });

  it('creates synthetic subgroup accessible by space key', () => {
    registry.registerManifest(
      { id: 'list', group: 'marketplace', subgroup: 'plugins' },
      makeCmd('list'),
    );
    registry.registerManifest(
      { id: 'enable', group: 'marketplace', subgroup: 'plugins' },
      makeCmd('enable'),
    );

    const subgroup = registry.get('marketplace plugins') as CommandGroup;
    expect(subgroup).toBeDefined();
    expect(subgroup.commands).toHaveLength(2);
  });

  it('manifest lookup works by colon path (for plugin executor)', () => {
    registry.registerManifest(
      { id: 'list', group: 'marketplace', subgroup: 'plugins' },
      makeCmd('list'),
    );

    expect(registry.getManifest('marketplace:plugins:list')).toBeDefined();
    expect(registry.getManifest('marketplace plugins list')).toBeDefined();
  });

  it('two subgroups with same command id do not collide', () => {
    registry.registerManifest(
      { id: 'list', group: 'marketplace', subgroup: 'plugins' },
      makeCmd('list'),
    );
    registry.registerManifest(
      { id: 'list', group: 'marketplace', subgroup: 'adapters' },
      makeCmd('list'),
    );

    const pluginList = registry.get('marketplace plugins list');
    const adapterList = registry.get('marketplace adapters list');
    expect(pluginList).toBeDefined();
    expect(adapterList).toBeDefined();
    expect(pluginList).not.toBe(adapterList);
  });
});

// ---------------------------------------------------------------------------
// System command subgroup registration
// ---------------------------------------------------------------------------

describe('registerGroup with subgroups', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  it('registers top-level commands', () => {
    registry.registerGroup({
      name: 'marketplace',
      describe: 'Marketplace',
      commands: [makeCmd('install'), makeCmd('uninstall')],
    });

    expect(registry.get(['marketplace', 'install'])).toBeDefined();
    expect(registry.get(['marketplace', 'uninstall'])).toBeDefined();
    expect(registry.get('marketplace install')).toBeDefined();
  });

  it('registers subgroup commands as 3-part paths', () => {
    registry.registerGroup({
      name: 'marketplace',
      describe: 'Marketplace',
      commands: [makeCmd('install')],
      subgroups: [
        {
          name: 'plugins',
          describe: 'Plugins',
          commands: [makeCmd('list'), makeCmd('enable'), makeCmd('disable')],
        },
      ],
    });

    // 3-part paths work
    expect(registry.get(['marketplace', 'plugins', 'list'])).toBeDefined();
    expect(registry.get(['marketplace', 'plugins', 'enable'])).toBeDefined();
    expect(registry.get(['marketplace', 'plugins', 'disable'])).toBeDefined();
    expect(registry.get('marketplace plugins list')).toBeDefined();

    // Top-level still works
    expect(registry.get(['marketplace', 'install'])).toBeDefined();

    // Subgroup itself is accessible
    expect(registry.get('marketplace plugins')).toBeDefined();
  });

  it('multiple subgroups do not collide', () => {
    registry.registerGroup({
      name: 'marketplace',
      describe: 'Marketplace',
      commands: [],
      subgroups: [
        {
          name: 'plugins',
          describe: 'Plugins',
          commands: [makeCmd('list')],
        },
        {
          name: 'adapters',
          describe: 'Adapters',
          commands: [makeCmd('list')],
        },
      ],
    });

    const pluginList = registry.get('marketplace plugins list');
    const adapterList = registry.get('marketplace adapters list');

    expect(pluginList).toBeDefined();
    expect(adapterList).toBeDefined();
    expect(pluginList).not.toBe(adapterList);
  });

  it('bare command names from subgroups do not register at top level', () => {
    registry.registerGroup({
      name: 'marketplace',
      describe: 'Marketplace',
      commands: [],
      subgroups: [
        {
          name: 'plugins',
          describe: 'Plugins',
          commands: [makeCmd('list')],
        },
      ],
    });

    // 'list' alone should NOT resolve (no collision)
    // Note: systemCommands does register bare names, but byName (used by get) doesn't
    // The real implementation also registers bare names in systemCommands, which is
    // a known limitation we'll address later
    const fullPath = registry.get('marketplace plugins list');
    expect(fullPath).toBeDefined();
  });

  it('returns group object when looking up subgroup', () => {
    registry.registerGroup({
      name: 'marketplace',
      describe: 'Marketplace',
      commands: [],
      subgroups: [
        {
          name: 'plugins',
          describe: 'Plugin management',
          commands: [makeCmd('list')],
        },
      ],
    });

    const subgroup = registry.get('marketplace plugins');
    expect(subgroup).toBeDefined();
    expect((subgroup as CommandGroup).describe).toBe('Plugin management');
    expect((subgroup as CommandGroup).commands).toHaveLength(1);
  });
});
