/**
 * @kb-labs/cli-commands/registry/service
 * TrieBackedRegistry — path-based CLI command registry (ADR-0015)
 *
 * Replaces InMemoryRegistry + all legacy flat-map methods.
 * System commands (in-process) always take priority over plugin commands.
 */

import type { RegisteredCommand } from './types';
import {
  TrieRouter,
  type RouteResult,
  type RegistryDiagnostics,
} from './trie-router';
import type { Command as SystemCommand, CommandGroup as SystemGroup } from '@kb-labs/shared-command-kit';

export class TrieBackedRegistry {
  private readonly systemRouter = new TrieRouter();
  private readonly pluginRouter = new TrieRouter();
  private partial = false;

  // ─── Registration ──────────────────────────────────────────────────────────

  register(cmd: SystemCommand): void {
    this.systemRouter.insertSystemCommand(cmd);
  }

  registerGroup(group: SystemGroup): void {
    this.systemRouter.insertSystemGroup(group);
    // Register group meta for the group path itself
    if (group.subgroups) {
      for (const sub of group.subgroups) {
        this.systemRouter.setGroupDescribe([group.name, sub.name], sub.describe ?? '');
      }
    }
  }

  registerManifest(cmd: RegisteredCommand): void {
    if (cmd.manifest._synthetic) { return; }

    const segs = cmd.manifest.segments;

    // Check system collision — system always wins
    const sysResult = this.systemRouter.resolve([...segs]);
    if (sysResult.type === 'system-cmd' || sysResult.type === 'system-group') {
      console.warn(`[registry] Plugin command "${segs.join(' ')}" collides with system command and will be shadowed.`);
      cmd.shadowed = true;
      return;
    }

    this.pluginRouter.insertCommand(segs, cmd);

    // Register aliases as additional trie entries pointing to the same command
    for (const alias of cmd.manifest.aliases ?? []) {
      const aliasSegs = alias.trim().split(/\s+/).filter(Boolean);
      if (aliasSegs.length === 0) { continue; }
      const aliasSysResult = this.systemRouter.resolve([...aliasSegs]);
      if (aliasSysResult.type === 'system-cmd' || aliasSysResult.type === 'system-group') {
        console.warn(`[registry] Plugin alias "${alias}" collides with system command and will be skipped.`);
        continue;
      }
      this.pluginRouter.insertCommand(aliasSegs, cmd);
    }

    // Register groupMeta from the plugin's ManifestV3 groupMeta declarations
    const v3 = cmd.manifest.manifestV2;
    if (v3?.cli?.groupMeta) {
      for (const meta of v3.cli.groupMeta) {
        const metaSegs = meta.path.trim().split(/\s+/).filter(Boolean);
        this.pluginRouter.setGroupDescribe(metaSegs, meta.describe);
      }
    }
  }

  // ─── Resolution ────────────────────────────────────────────────────────────

  resolve(tokens: string[]): RouteResult {
    if (tokens.length > 0) {
      const sysResult = this.systemRouter.resolve(tokens);
      if (sysResult.type !== 'not-found') {
        return sysResult;
      }
    }
    return this.pluginRouter.resolve(tokens);
  }

  // ─── Tab completion ─────────────────────────────────────────────────────────

  complete(tokens: string[]): string[] {
    const sysCompletions = this.systemRouter.complete(tokens);
    const pluginCompletions = this.pluginRouter.complete(tokens);
    return [...new Set([...sysCompletions, ...pluginCompletions])];
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  listCommands(): RegisteredCommand[] {
    return this.pluginRouter.listAll();
  }

  listCommandsUnder(segments: string[]): RegisteredCommand[] {
    return this.pluginRouter.listUnder(segments);
  }

  getCommandAt(segments: string[]): RegisteredCommand | null {
    return this.pluginRouter.getAt(segments);
  }

  // ─── Partial loading state ─────────────────────────────────────────────────

  markPartial(v: boolean): void {
    this.partial = v;
  }

  isPartial(): boolean {
    return this.partial;
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  getDiagnostics(): RegistryDiagnostics {
    return {
      systemCommandCount: this.systemRouter.listAll().length,
      systemGroupCount: 0,
      pluginCommandCount: this.pluginRouter.listAll().length,
      partialLoad: this.partial,
    };
  }
}

export function createRegistry(): TrieBackedRegistry {
  return new TrieBackedRegistry();
}

/** Global registry singleton — populated by bootstrap before any command runs. */
export const registry = new TrieBackedRegistry();
