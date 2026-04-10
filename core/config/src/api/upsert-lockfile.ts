/**
 * @module @kb-labs/core/config/api/upsert-lockfile
 * Upsert lockfile operations
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readLockfile, writeLockfile, type LockfileData } from '../lockfile/lockfile';
import { ensureWithinWorkspace } from '../utils/fs-atomic';
import type { UpsertLockfileOptions, InitResult } from '../types/init';

/**
 * Upsert lockfile with new references
 */
export async function upsertLockfile(
  opts: UpsertLockfileOptions
): Promise<InitResult> {
  const cwd = path.resolve(opts.cwd);
  const lockfilePath = path.join(cwd, '.kb', 'lock.json');
  const oldLockfilePath = path.join(cwd, '.kb', 'lockfile.json');
  
  const result: InitResult = {
    actions: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };
  
  // Ensure we're writing within workspace
  ensureWithinWorkspace(lockfilePath, cwd);
  
  // Check for deprecated lockfile location
  try {
    await fs.access(oldLockfilePath);
    result.warnings.push(
      'Deprecated lockfile found at .kb/lockfile.json, please migrate to .kb/lock.json'
    );
  } catch {
    // No old lockfile, that's fine
  }
  
  // Read existing lockfile
  const existing = await readLockfile(cwd);
  
  // Build lockfile data
  const lockfileData: LockfileData = {
    $schema: 'https://schemas.kb-labs.dev/lockfile.schema.json',
    schemaVersion: '1.0',
    orgPreset: opts.presetRef !== undefined ? opts.presetRef || undefined : existing?.orgPreset,
    profile: opts.profileRef !== undefined ? opts.profileRef || undefined : existing?.profile,
    policyBundle: opts.policyBundle !== undefined ? opts.policyBundle || undefined : existing?.policyBundle,
    hashes: existing?.hashes || {},
    generatedAt: new Date().toISOString(),
  };
  
  if (!existing) {
    // Creating new lockfile
    if (!opts.dryRun) {
      await writeLockfile(cwd, lockfileData);
    }
    result.actions.push({ kind: 'write', path: lockfilePath });
    result.created.push(lockfilePath);
  } else {
    // Updating existing lockfile
    if (!opts.dryRun) {
      await writeLockfile(cwd, lockfileData);
    }
    result.actions.push({ kind: 'update', path: lockfilePath });
    result.updated.push(lockfilePath);
  }
  
  return result;
}

