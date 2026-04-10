/**
 * @module @kb-labs/core/config/types/init
 * Types for init operations
 */


export interface InitWorkspaceOptions {
  cwd: string;
  format?: 'yaml' | 'json';
  presetRef?: string | null;
  profiles?: Record<string, string>;
  products?: string[];
  dryRun?: boolean;
  force?: boolean;
}

export interface InitAction {
  kind: 'write' | 'append' | 'update' | 'skip' | 'conflict';
  path: string;
  previewDiff?: string;
}

export interface InitResult {
  actions: InitAction[];
  created: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
}

export interface UpsertLockfileOptions {
  cwd: string;
  presetRef?: string | null;
  profileRef?: string | null;
  policyBundle?: string | null;
  dryRun?: boolean;
}

