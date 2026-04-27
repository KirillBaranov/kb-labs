/**
 * Legacy V2 types for backward compatibility
 * These types were removed from cli-contracts but are still needed
 * for the adapter layer in service.ts
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';
import type { FlagDefinition, RegisteredCommand } from './types';

export interface CommandRun {
  (ctx: PluginContextV3, argv: string[], flags: Record<string, unknown>): Promise<number | void>;
}

export interface Command {
  name: string;
  category?: string;
  describe: string;
  longDescription?: string;
  aliases?: string[];
  flags?: FlagDefinition[];
  examples?: string[];
  run: CommandRun;
}

export interface CommandGroup {
  name: string;
  describe?: string;
  commands: Command[];
  subgroups?: CommandGroup[];
}

export interface CommandRegistry {
  register(cmd: Command): void;
  registerGroup(group: CommandGroup): void;
  registerManifest(cmd: RegisteredCommand): void;
  list(): Command[];
  listGroups(): CommandGroup[];
  listManifests(): RegisteredCommand[];
  markPartial(isPartial: boolean): void;
  isPartial(): boolean;
}
