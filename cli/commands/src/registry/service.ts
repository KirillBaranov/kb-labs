import type { Command, CommandGroup, CommandRegistry } from "./legacy-types";
import type { RegisteredCommand } from "./types";

/**
 * Convert RegisteredCommand to Command adapter
 *
 * This is a minimal adapter - actual execution happens in bootstrap.ts via executePlugin().
 * The run() function here is never called for plugin commands.
 */
function manifestToCommand(registered: RegisteredCommand): Command {
  return {
    name: registered.manifest.id,
    category: registered.manifest.group,
    describe: registered.manifest.describe,
    longDescription: registered.manifest.longDescription,
    aliases: registered.manifest.aliases || [],
    flags: registered.manifest.flags,
    examples: registered.manifest.examples,
    async run() {
      throw new Error(`Command ${registered.manifest.id} should be executed via plugin-executor, not via legacy run() path.`);
    },
  };
}

/**
 * Build canonical ID for a plugin command manifest.
 *
 * Format:
 *   - 3-part: "group:subgroup:id"  (e.g., "marketplace:plugins:list")
 *   - 2-part: "group:id"           (e.g., "marketplace:list")
 *   - bare:   "id"                 (fallback when no group)
 */
function buildCanonicalId(manifest: RegisteredCommand['manifest']): string {
  const { id, group, subgroup } = manifest;
  if (group && subgroup) {
    return `${group}:${subgroup}:${id}`;
  }
  if (group) {
    return `${group}:${id}`;
  }
  return id;
}

export interface ProductGroup {
  name: string;
  describe?: string;
  commands: RegisteredCommand[];
}

export type CommandType = 'system' | 'plugin';

export interface CommandLookupResult {
  cmd: Command | CommandGroup;
  type: CommandType;
}

class InMemoryRegistry implements CommandRegistry {
  // System commands (in-process): key = any registered name/alias
  private systemCommands = new Map<string, Command>();
  // Plugin commands: key = canonicalId only
  private pluginByCanonical = new Map<string, RegisteredCommand>();
  // Alias → canonicalId: covers all user-input variants that resolve to a plugin
  private pluginAliases = new Map<string, string>();

  // Legacy unified collection for backward compatibility (display/get)
  private byName = new Map<string, Command | CommandGroup>();
  private groups = new Map<string, CommandGroup>();
  // manifests: any key → RegisteredCommand (for listing/lookup; still stores multi-key for compat)
  private manifests = new Map<string, RegisteredCommand>();
  private partial = false;

  // ─── System command registration ────────────────────────────────────────

  register(cmd: Command): void {
    this.systemCommands.set(cmd.name, cmd);
    this.byName.set(cmd.name, cmd);
    for (const a of cmd.aliases || []) {
      this.systemCommands.set(a, cmd);
      this.byName.set(a, cmd);
    }
  }

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

  // ─── Plugin command registration ────────────────────────────────────────

  registerManifest(cmd: RegisteredCommand): void {
    const canonicalId = buildCanonicalId(cmd.manifest);

    // System commands ALWAYS win — check all variants of canonical
    const collisionKey = this._findSystemCollision(cmd.manifest, canonicalId);
    if (collisionKey) {
      console.warn(`[registry] Plugin command "${canonicalId}" collides with system command "${collisionKey}". System command takes priority.`);
      cmd.shadowed = true;
    }

    // Check alias collisions
    const collisionAliases = new Set<string>();
    for (const alias of cmd.manifest.aliases || []) {
      if (this.systemCommands.has(alias)) {
        console.warn(`[registry] Plugin alias "${alias}" collides with system command. System command takes priority.`);
        collisionAliases.add(alias);
      }
    }

    // Always store in manifests for listing (even shadowed)
    this.pluginByCanonical.set(canonicalId, cmd);
    this.manifests.set(canonicalId, cmd);
    this.manifests.set(cmd.manifest.id, cmd);

    if (cmd.shadowed) {
      return; // Don't register aliases or byName for shadowed commands
    }

    // Register all alias variants → canonicalId
    this._registerPluginAliases(cmd, canonicalId, collisionAliases);

    // Register in byName for display/get
    const commandAdapter = manifestToCommand(cmd);
    this.byName.set(canonicalId, commandAdapter);

    // Also register space-separated variants for legacy .get() calls
    const spaceCanonical = canonicalId.replace(/:/g, ' ');
    this.byName.set(spaceCanonical, commandAdapter);

    // Synthetic subgroups for help display
    this._registerSyntheticGroups(cmd, commandAdapter);
  }

  /**
   * Check whether any system command already owns the canonical id or its parts.
   * Returns the colliding key if found, null otherwise.
   */
  private _findSystemCollision(manifest: RegisteredCommand['manifest'], canonicalId: string): string | null {
    // Check canonical id
    if (this.systemCommands.has(canonicalId)) return canonicalId;
    // Check bare id
    if (this.systemCommands.has(manifest.id)) return manifest.id;
    // Check space variants
    const space = canonicalId.replace(/:/g, ' ');
    if (this.systemCommands.has(space)) return space;
    return null;
  }

  /**
   * Register all lookup aliases for a plugin command.
   *
   * Priority (what beats what) is handled in resolveToCanonical at query time.
   * Here we just build the mapping.
   *
   * Aliases registered:
   *   - canonicalId itself        ("marketplace:plugins:list")
   *   - bare id                   ("list")         ← low priority, may clash
   *   - 2-part shorthand          ("marketplace:list", "marketplace list")
   *   - manifest.aliases[]        (user-defined aliases, except collisions)
   */
  private _registerPluginAliases(
    cmd: RegisteredCommand,
    canonicalId: string,
    collisionAliases: Set<string>,
  ): void {
    const { id, group, subgroup } = cmd.manifest;

    const register = (key: string) => {
      if (!this.systemCommands.has(key) && !this.systemCommands.has(key.replace(/:/g, ' '))) {
        // Don't overwrite a more-specific canonical alias with a shorter one
        if (!this.pluginAliases.has(key)) {
          this.pluginAliases.set(key, canonicalId);
          this.manifests.set(key, cmd);
        }
      }
    };

    // Canonical itself
    this.pluginAliases.set(canonicalId, canonicalId);
    const spaceCanonical = canonicalId.replace(/:/g, ' ');
    this.pluginAliases.set(spaceCanonical, canonicalId);
    this.manifests.set(spaceCanonical, cmd);

    if (group && subgroup) {
      // 3-part: also register 2-part shorthand "group:id" and "group id" as fallback aliases
      const twoPartColon = `${group}:${id}`;
      const twoPartSpace = `${group} ${id}`;
      register(twoPartColon);
      register(twoPartSpace);
      this.manifests.set(twoPartColon, cmd);
      this.manifests.set(twoPartSpace, cmd);

      // Full group paths
      const fullPath = `${group} ${subgroup} ${id}`;
      this.pluginAliases.set(fullPath, canonicalId);
      this.manifests.set(fullPath, cmd);

      // Subgroup group key for get() lookup
      const colonPath = `${group}:${subgroup}:${id}`;
      this.pluginAliases.set(colonPath, canonicalId);
      this.manifests.set(colonPath, cmd);
    } else if (group) {
      const colonName = `${group}:${id}`;
      const spaceName = `${group} ${id}`;
      this.pluginAliases.set(colonName, canonicalId);
      this.pluginAliases.set(spaceName, canonicalId);
      this.manifests.set(colonName, cmd);
      this.manifests.set(spaceName, cmd);
    }

    // Bare id (lowest priority — only if no collision)
    register(id);

    // User-defined manifest aliases
    for (const alias of cmd.manifest.aliases || []) {
      if (!collisionAliases.has(alias)) {
        register(alias);
      }
    }
  }

  /**
   * Register synthetic subgroups for help display.
   */
  private _registerSyntheticGroups(cmd: RegisteredCommand, commandAdapter: Command): void {
    const { id, group, subgroup } = cmd.manifest;

    if (group && subgroup) {
      const subgroupKey = `${group} ${subgroup}`;
      if (!this.groups.has(subgroupKey)) {
        this.groups.set(subgroupKey, {
          name: subgroupKey,
          describe: subgroup,
          commands: [],
        });
        this.byName.set(subgroupKey, this.groups.get(subgroupKey)!);
      }
      (this.groups.get(subgroupKey)! as any).commands.push(commandAdapter);

      // Also register 2-part in byName for display
      const twoPartSpace = `${group} ${id}`;
      if (!this.byName.has(twoPartSpace)) {
        this.byName.set(twoPartSpace, commandAdapter);
      }
      const twoPartColon = `${group}:${id}`;
      if (!this.byName.has(twoPartColon)) {
        this.byName.set(twoPartColon, commandAdapter);
      }

      // Full space path for byName
      const fullPath = `${group} ${subgroup} ${id}`;
      this.byName.set(fullPath, commandAdapter);
    } else if (group) {
      const fullName = `${group} ${id}`;
      const colonName = `${group}:${id}`;
      this.byName.set(fullName, commandAdapter);
      this.byName.set(colonName, commandAdapter);
    }
  }

  // ─── Resolution ──────────────────────────────────────────────────────────

  /**
   * Resolve any user input to its canonical plugin ID.
   *
   * Returns canonicalId if found in plugin aliases, undefined otherwise.
   */
  private resolveToCanonical(input: string): string | undefined {
    // Direct canonical match
    if (this.pluginAliases.has(input)) {
      return this.pluginAliases.get(input);
    }
    // Try with colon↔space conversion
    const converted = input.includes(':') ? input.replace(/:/g, ' ') : input.replace(/ /g, ':');
    if (this.pluginAliases.has(converted)) {
      return this.pluginAliases.get(converted);
    }
    return undefined;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  markPartial(partial: boolean): void {
    this.partial = partial;
  }

  isPartial(): boolean {
    return this.partial;
  }

  getManifest(id: string): RegisteredCommand | undefined {
    return this.manifests.get(id);
  }

  listManifests(): RegisteredCommand[] {
    const unique = new Set<RegisteredCommand>();
    for (const cmd of this.pluginByCanonical.values()) {
      unique.add(cmd);
    }
    return Array.from(unique);
  }

  has(name: string): boolean {
    return this.byName.has(name) || this.pluginAliases.has(name);
  }

  /**
   * Get command with type information for secure routing.
   *
   * System commands ALWAYS win — checked first before any plugin lookup.
   * Returns type='system' for system commands (in-process execution).
   * Returns type='plugin' for plugin commands (subprocess execution).
   */
  getWithType(nameOrPath: string | string[]): CommandLookupResult | undefined {
    const normalized = typeof nameOrPath === 'string' ? nameOrPath : nameOrPath.join(' ');

    // ── 1. System commands always win ──────────────────────────────────────
    if (this.systemCommands.has(normalized)) {
      return { cmd: this.systemCommands.get(normalized)!, type: 'system' };
    }
    // Try colon variant for system commands
    const colonVariant = normalized.replace(/ /g, ':');
    if (this.systemCommands.has(colonVariant)) {
      return { cmd: this.systemCommands.get(colonVariant)!, type: 'system' };
    }
    // Check groups (always system)
    if (this.groups.has(normalized)) {
      return { cmd: this.groups.get(normalized)!, type: 'system' };
    }

    // ── 2. Plugin lookup via canonical resolution ──────────────────────────
    const canonicalId = this.resolveToCanonical(normalized);
    if (canonicalId) {
      const pluginCmd = this.pluginByCanonical.get(canonicalId);
      if (pluginCmd && !pluginCmd.shadowed) {
        const cmd = this.byName.get(canonicalId) ?? this.byName.get(normalized);
        if (cmd) {
          return { cmd, type: 'plugin' };
        }
      }
    }

    // ── 3. Fallback: legacy byName lookup (handles edge cases) ─────────────
    const cmd = this.get(nameOrPath);
    if (!cmd) {return undefined;}

    if ('commands' in cmd) {
      return { cmd, type: 'system' };
    }

    // Determine if it's a system or plugin command
    if (this.systemCommands.has(normalized) || this.systemCommands.has(colonVariant)) {
      return { cmd, type: 'system' };
    }

    // Check via manifest
    const manifestCmd = this.getManifestCommand(normalized);
    if (manifestCmd && !manifestCmd.shadowed) {
      return { cmd, type: 'plugin' };
    }

    return { cmd, type: 'system' };
  }

  get(nameOrPath: string | string[]): Command | CommandGroup | undefined {
    if (typeof nameOrPath === 'string') {
      if (this.byName.has(nameOrPath)) {
        return this.byName.get(nameOrPath);
      }
      if (nameOrPath.includes(':')) {
        const spaceKey = nameOrPath.replace(/:/g, ' ');
        if (this.byName.has(spaceKey)) {
          return this.byName.get(spaceKey);
        }
        // Try parts[0] group + rest for 2-part colon
        const parts = nameOrPath.split(':');
        if (parts.length === 2) {
          const spaceKey2 = parts.join(' ');
          if (this.byName.has(spaceKey2)) {
            return this.byName.get(spaceKey2);
          }
        }
      }
    }

    const key = Array.isArray(nameOrPath) ? nameOrPath.join(' ') : nameOrPath;
    if (this.byName.has(key)) {
      return this.byName.get(key);
    }

    if (Array.isArray(nameOrPath) && nameOrPath.length === 1 && nameOrPath[0]?.includes(':')) {
      if (this.byName.has(nameOrPath[0])) {
        return this.byName.get(nameOrPath[0]);
      }
      const [group, command] = nameOrPath[0].split(':');
      const legacyKey = `${group} ${command}`;
      if (this.byName.has(legacyKey)) {
        return this.byName.get(legacyKey);
      }
    }

    if (Array.isArray(nameOrPath)) {
      const dot = nameOrPath.join('.');
      if (this.byName.has(dot)) {
        return this.byName.get(dot);
      }
    }

    if (Array.isArray(nameOrPath) && nameOrPath.length >= 2) {
      const [groupPrefix, ...cmdParts] = nameOrPath;
      const cmdName = cmdParts.join(' ');
      for (const group of this.groups.values()) {
        if (group.name === groupPrefix || group.name.startsWith(groupPrefix + ':')) {
          const fullName = `${group.name} ${cmdName}`;
          if (this.byName.has(fullName)) {
            return this.byName.get(fullName);
          }
        }
      }
    }

    return undefined;
  }

  list(): Command[] {
    const commands = new Set<Command>();
    for (const value of this.byName.values()) {
      if ('run' in value) {
        commands.add(value);
      }
    }
    return Array.from(commands);
  }

  listGroups(): CommandGroup[] {
    return Array.from(this.groups.values());
  }

  getGroupsByPrefix(prefix: string): CommandGroup[] {
    const result: CommandGroup[] = [];
    for (const group of this.groups.values()) {
      if (group.name === prefix || group.name.startsWith(prefix + ':')) {
        result.push(group);
      }
    }
    return result;
  }

  getCommandsByGroupPrefix(prefix: string): Command[] {
    const result: Command[] = [];
    for (const group of this.groups.values()) {
      if (group.name === prefix || group.name.startsWith(prefix + ':')) {
        result.push(...group.commands);
      }
    }
    return result;
  }

  listProductGroups(): ProductGroup[] {
    const groups = new Map<string, ProductGroup>();
    for (const cmd of this.listManifests()) {
      const groupName = cmd.manifest.group;
      if (!groups.has(groupName)) {
        groups.set(groupName, {
          name: groupName,
          describe: cmd.manifest.group,
          commands: [],
        });
      }
      groups.get(groupName)!.commands.push(cmd);
    }
    return Array.from(groups.values());
  }

  getCommandsByGroup(group: string): RegisteredCommand[] {
    return this.listManifests()
      .filter((cmd) => cmd.manifest.group === group)
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  getManifestCommand(idOrAlias: string): RegisteredCommand | undefined {
    if (this.manifests.has(idOrAlias)) {
      return this.manifests.get(idOrAlias);
    }

    // Try canonical resolution
    const canonicalId = this.resolveToCanonical(idOrAlias);
    if (canonicalId) {
      return this.pluginByCanonical.get(canonicalId);
    }

    for (const cmd of this.pluginByCanonical.values()) {
      if (cmd.manifest.aliases?.includes(idOrAlias)) {
        return cmd;
      }
      if (cmd.manifest.id.replace(/:/g, ' ') === idOrAlias) {
        return cmd;
      }
    }

    return undefined;
  }
}

export const registry = new InMemoryRegistry();

export function findCommand(nameOrPath: string | string[]) {
  return registry.get(nameOrPath);
}

/**
 * Find command with type information for secure routing.
 *
 * Use this in bootstrap.ts to determine execution path:
 * - type='system' → execute via cmd.run() in-process
 * - type='plugin' → execute via executePlugin() in plugin-executor
 *
 * System commands ALWAYS take priority over plugin commands.
 */
export function findCommandWithType(nameOrPath: string | string[]): CommandLookupResult | undefined {
  return registry.getWithType(nameOrPath);
}
