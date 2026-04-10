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
      // This should never be called - plugin commands are executed via executePlugin() in bootstrap.ts
      throw new Error(`Command ${registered.manifest.id} should be executed via plugin-executor, not via legacy run() path.`);
    },
  };
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
  // Separate collections for security isolation
  private systemCommands = new Map<string, Command>();  // System commands (in-process)
  private pluginCommands = new Map<string, RegisteredCommand>();  // Plugin commands (subprocess)

  // Legacy unified collection for backward compatibility
  private byName = new Map<string, Command | CommandGroup>();
  private groups = new Map<string, CommandGroup>();
  private manifests = new Map<string, RegisteredCommand>();
  private partial = false;

  register(cmd: Command): void {
    // Store in systemCommands for type checking
    this.systemCommands.set(cmd.name, cmd);

    // Also keep in byName for backward compatibility
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
      // Store each command from group in systemCommands
      this.systemCommands.set(cmd.name, cmd);

      const fullName = `${group.name} ${cmd.name}`;
      this.systemCommands.set(fullName, cmd);
      this.byName.set(fullName, cmd);

      for (const alias of cmd.aliases || []) {
        this.systemCommands.set(alias, cmd);
        this.byName.set(alias, cmd);
      }
    }

    // Register subgroups (e.g., marketplace → plugins, adapters)
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

  registerManifest(cmd: RegisteredCommand): void {
    // Check for collision with system commands
    const cmdId = cmd.manifest.id;
    const hasCollision = this.systemCommands.has(cmdId);

    if (hasCollision) {
      console.warn(`[registry] Plugin command "${cmdId}" collides with system command. System command takes priority.`);
      // Mark plugin command as shadowed - it will NOT be executable
      cmd.shadowed = true;
    }

    // Check aliases for collisions
    const collisionAliases = new Set<string>();
    for (const alias of cmd.manifest.aliases || []) {
      if (this.systemCommands.has(alias)) {
        console.warn(`[registry] Plugin alias "${alias}" collides with system command. System command takes priority.`);
        collisionAliases.add(alias);
      }
    }

    // Store in pluginCommands (even if shadowed, for manifest listing)
    this.pluginCommands.set(cmdId, cmd);
    this.manifests.set(cmdId, cmd);

    // Only add to byName if NO collision with system commands
    // This ensures system commands always win in routing
    if (!hasCollision) {
      const commandAdapter = manifestToCommand(cmd);

      this.byName.set(cmdId, commandAdapter);
      this.byName.set(commandAdapter.name, commandAdapter);

      // Also register with space-separated format for multi-part commands
      // e.g., "agent:trace:stats" → "agent trace stats"
      if (cmdId.includes(':')) {
        const spaceSeparated = cmdId.replace(/:/g, ' ');
        this.byName.set(spaceSeparated, commandAdapter);
      }

      // Register with full group + command format for invocation
      if (cmd.manifest.group && cmd.manifest.subgroup) {
        // 3-part path: "marketplace plugins list"
        const fullPath = `${cmd.manifest.group} ${cmd.manifest.subgroup} ${cmd.manifest.id}`;
        const colonPath = `${cmd.manifest.group}:${cmd.manifest.subgroup}:${cmd.manifest.id}`;
        this.byName.set(fullPath, commandAdapter);
        this.byName.set(colonPath, commandAdapter);
        this.manifests.set(fullPath, cmd);
        this.manifests.set(colonPath, cmd);
        this.pluginCommands.set(fullPath, cmd);
        this.pluginCommands.set(colonPath, cmd);

        // Also register 2-part: "marketplace list" (without subgroup, for discoverability)
        const twoPartName = `${cmd.manifest.group} ${cmd.manifest.id}`;
        if (!this.byName.has(twoPartName)) {
          this.byName.set(twoPartName, commandAdapter);
        }

        // Synthetic subgroup for help display
        const subgroupKey = `${cmd.manifest.group} ${cmd.manifest.subgroup}`;
        if (!this.groups.has(subgroupKey)) {
          this.groups.set(subgroupKey, {
            name: subgroupKey,
            describe: cmd.manifest.subgroup,
            commands: [],
          });
          this.byName.set(subgroupKey, this.groups.get(subgroupKey)!);
        }
        (this.groups.get(subgroupKey)! as any).commands.push(commandAdapter);
      } else if (cmd.manifest.group) {
        const fullName = `${cmd.manifest.group} ${cmd.manifest.id}`;
        const colonName = `${cmd.manifest.group}:${cmd.manifest.id}`;
        this.byName.set(fullName, commandAdapter);
        this.byName.set(colonName, commandAdapter);
        this.manifests.set(fullName, cmd);
        this.manifests.set(colonName, cmd);
        this.pluginCommands.set(fullName, cmd);
        this.pluginCommands.set(colonName, cmd);
      }

      if (cmd.manifest.aliases) {
        for (const alias of cmd.manifest.aliases) {
          // Skip aliases that collide with system commands
          if (!collisionAliases.has(alias)) {
            this.byName.set(alias, commandAdapter);
          }
        }
      }
    }
  }

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
    for (const cmd of this.manifests.values()) {
      unique.add(cmd);
    }
    return Array.from(unique);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /**
   * Get command with type information for secure routing
   *
   * Returns type='system' for commands from registerGroup() - execute in-process
   * Returns type='plugin' for commands from registerManifest() - execute in subprocess
   *
   * This separation prevents malicious plugins from escaping the sandbox.
   */
  getWithType(nameOrPath: string | string[]): CommandLookupResult | undefined {
    const cmd = this.get(nameOrPath);
    if (!cmd) {
      return undefined;
    }

    // Groups are always system-level
    if ('commands' in cmd) {
      return { cmd, type: 'system' };
    }

    // Check if command is in systemCommands (registered via register() or registerGroup())
    const normalizedName = typeof nameOrPath === 'string' ? nameOrPath : nameOrPath.join(' ');

    // Try direct lookup
    if (this.systemCommands.has(normalizedName)) {
      return { cmd, type: 'system' };
    }

    // Try with colon-to-space conversion for system commands
    if (normalizedName.includes(':')) {
      const spaceVersion = normalizedName.replace(':', ' ');
      if (this.systemCommands.has(spaceVersion)) {
        return { cmd, type: 'system' };
      }
    }

    // Check if it's a plugin command (has manifest)
    const manifestCmd = this.getManifestCommand(normalizedName);
    if (manifestCmd) {
      return { cmd, type: 'plugin' };
    }

    // Default to system if found in byName but not categorized
    // This handles edge cases and ensures backward compatibility
    return { cmd, type: 'system' };
  }

  get(nameOrPath: string | string[]): Command | CommandGroup | undefined {
    if (typeof nameOrPath === "string") {
      if (this.byName.has(nameOrPath)) {
        return this.byName.get(nameOrPath);
      }
      if (nameOrPath.includes(":")) {
        const parts = nameOrPath.split(":");
        if (parts.length === 2) {
          const exactMatch = this.byName.get(nameOrPath);
          if (exactMatch) {
            return exactMatch;
          }

          const spaceKey = parts.join(" ");
          if (this.byName.has(spaceKey)) {
            return this.byName.get(spaceKey);
          }
        }
      }
    }

    const key = Array.isArray(nameOrPath)
      ? nameOrPath.join(" ")
      : nameOrPath;

    if (this.byName.has(key)) {
      return this.byName.get(key);
    }

    if (
      Array.isArray(nameOrPath) &&
      nameOrPath.length === 1 &&
      nameOrPath[0]?.includes(":")
    ) {
      if (this.byName.has(nameOrPath[0])) {
        return this.byName.get(nameOrPath[0]);
      }

      const [group, command] = nameOrPath[0].split(":");
      const legacyKey = `${group} ${command}`;
      if (this.byName.has(legacyKey)) {
        return this.byName.get(legacyKey);
      }
    }

    if (Array.isArray(nameOrPath)) {
      const dot = nameOrPath.join(".");
      if (this.byName.has(dot)) {
        return this.byName.get(dot);
      }
    }

    // Try to find command in groups by prefix (e.g., ["system", "hello"] -> "system:info hello")
    if (Array.isArray(nameOrPath) && nameOrPath.length >= 2) {
      const [groupPrefix, ...cmdParts] = nameOrPath;
      const cmdName = cmdParts.join(" ");

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
      if ("run" in value) {
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

    for (const cmd of this.manifests.values()) {
      if (cmd.manifest.aliases?.includes(idOrAlias)) {
        return cmd;
      }
      // Support both colon and space separators (e.g., "agent:trace:stats" or "agent trace stats")
      if (cmd.manifest.id.replace(/:/g, " ") === idOrAlias) {
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
 * Find command with type information for secure routing
 *
 * Use this in bootstrap.ts to determine execution path:
 * - type='system' → execute via cmd.run() in-process
 * - type='plugin' → execute via executePlugin() in plugin-executor
 */
export function findCommandWithType(nameOrPath: string | string[]): CommandLookupResult | undefined {
  return registry.getWithType(nameOrPath);
}

