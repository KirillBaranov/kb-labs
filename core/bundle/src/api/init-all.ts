/**
 * @module @kb-labs/core-bundle/api/init-all
 * Orchestrate all init operations
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  InitResult,
  InitWorkspaceOptions,
  UpsertLockfileOptions,
} from '@kb-labs/core-config';
import type { ProductId } from '@kb-labs/core-types';
import type { InitPolicyOptions } from '@kb-labs/core-policy';

export interface InitAllOptions {
  cwd: string;
  format?: 'yaml' | 'json';
  products?: ProductId[];
  presetRef?: string | null;
  policyBundle?: string | null;
  dryRun?: boolean;
  force?: boolean;
}

export interface InitAllResult {
  workspace: InitResult;
  profile: InitResult;
  policy: InitResult;
  lockfile: InitResult;
  stats: {
    created: number;
    updated: number;
    skipped: number;
    conflicts: number;
  };
}

/**
 * Merge multiple InitResults into aggregated stats
 */
function aggregateStats(...results: InitResult[]): InitAllResult['stats'] {
  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
  };
  
  for (const result of results) {
    stats.created += result.created.length;
    stats.updated += result.updated.length;
    stats.skipped += result.skipped.length;
    stats.conflicts += result.actions.filter(a => a.kind === 'conflict').length;
  }
  
  return stats;
}

/**
 * Update .gitignore with KB Labs entries
 */
async function updateGitignore(cwd: string, dryRun: boolean): Promise<InitResult> {
  const result: InitResult = {
    actions: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };
  
  const gitignorePath = path.join(cwd, '.gitignore');
  const entriesToAdd = [
    '.kb/*/profiles-cache/',
    '.kb/lock.json',
  ];
  
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    const linesToAdd: string[] = [];
    
    for (const entry of entriesToAdd) {
      if (!lines.some(line => line.trim() === entry)) {
        linesToAdd.push(entry);
      }
    }
    
    if (linesToAdd.length === 0) {
      result.actions.push({ kind: 'skip', path: gitignorePath });
      result.skipped.push(gitignorePath);
      return result;
    }
    
    // Append new entries
    const newContent = content.trimEnd() + '\n\n# KB Labs\n' + linesToAdd.join('\n') + '\n';
    
    if (!dryRun) {
      const { writeFileAtomic } = await import('@kb-labs/core-config');
      await writeFileAtomic(gitignorePath, newContent);
    }
    
    result.actions.push({ kind: 'append', path: gitignorePath });
    result.updated.push(gitignorePath);
  } catch {
    // .gitignore doesn't exist, skip
    result.actions.push({ kind: 'skip', path: gitignorePath });
    result.skipped.push(gitignorePath);
  }
  
  return result;
}

/**
 * Initialize all KB Labs components
 */
export async function initAll(opts: InitAllOptions): Promise<InitAllResult> {
  const cwd = path.resolve(opts.cwd);
  const products = opts.products || ['aiReview'];
  const format = opts.format || 'yaml';
  
  // Import all init functions
  const { initWorkspaceConfig, upsertLockfile } = await import('@kb-labs/core-config');
  const { initPolicy } = await import('@kb-labs/core-policy');
  
  // Step 1: Init workspace config
  const workspaceOpts: InitWorkspaceOptions = {
    cwd,
    format,
    presetRef: opts.presetRef,
    products,
    dryRun: opts.dryRun,
    force: opts.force,
  };
  
  const workspaceResult = await initWorkspaceConfig(workspaceOpts);
  
  // Step 2: Profile scaffolding has been removed (Profiles v2 handles config-only setup)
  const profileResult: InitResult = {
    actions: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };
  
  // Step 3: Init policy
  const policyOpts: InitPolicyOptions = {
    cwd,
    bundleName: opts.policyBundle || 'default',
    scaffoldCommented: true,
    dryRun: opts.dryRun,
    force: opts.force,
  };
  
  const policyResult = await initPolicy(policyOpts);
  
  // Step 4: Update .gitignore
  const gitignoreResult = await updateGitignore(cwd, opts.dryRun || false);
  
  // Step 5: Upsert lockfile
  const lockfileOpts: UpsertLockfileOptions = {
    cwd,
    presetRef: opts.presetRef,
    policyBundle: opts.policyBundle,
    dryRun: opts.dryRun,
  };
  
  const lockfileResult = await upsertLockfile(lockfileOpts);
  
  // Aggregate stats
  const stats = aggregateStats(
    workspaceResult,
    profileResult,
    policyResult,
    gitignoreResult,
    lockfileResult
  );
  
  return {
    workspace: workspaceResult,
    profile: profileResult,
    policy: policyResult,
    lockfile: lockfileResult,
    stats,
  };
}

