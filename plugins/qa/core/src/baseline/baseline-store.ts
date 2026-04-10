import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PATHS } from '@kb-labs/qa-contracts';
import type { BaselineSnapshot } from '@kb-labs/qa-contracts';

/**
 * Load baseline snapshot from disk.
 */
export function loadBaseline(rootDir: string): BaselineSnapshot | null {
  const path = join(rootDir, PATHS.BASELINE);
  if (!existsSync(path)) {return null;}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save baseline snapshot to disk.
 */
export function saveBaseline(rootDir: string, snapshot: BaselineSnapshot): void {
  const path = join(rootDir, PATHS.BASELINE);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
}
