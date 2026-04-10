/**
 * Legacy V2 types for backward compatibility
 * These types were removed from cli-contracts but are still needed
 * for the adapter layer in service.ts
 */

import type { FlagDefinition } from './types';

export interface CommandRun {
  (ctx: any, argv: string[], flags: Record<string, any>): Promise<number | void>;
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
  registerManifest(cmd: any): void;
  list(): Command[];
  listGroups(): CommandGroup[];
  listManifests(): any[];
  markPartial(isPartial: boolean): void;
  isPartial(): boolean;
}
