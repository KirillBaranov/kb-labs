import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { QA_DATA_DIR, HISTORY_MAX_ENTRIES } from '@kb-labs/qa-contracts';
import type { HistoryEntry } from '@kb-labs/qa-contracts';

function trendPath(rootDir: string, checkId: string): string {
  return join(rootDir, QA_DATA_DIR, 'trends', `${checkId}.json`);
}

/**
 * Load per-check trend history from disk.
 */
export function loadTrendHistory(rootDir: string, checkId: string): HistoryEntry[] {
  const path = trendPath(rootDir, checkId);
  if (!existsSync(path)) { return []; }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Append a history entry to the per-check trend store.
 * Keeps max HISTORY_MAX_ENTRIES entries per check.
 */
export function appendTrendEntry(rootDir: string, checkId: string, entry: HistoryEntry): void {
  const path = trendPath(rootDir, checkId);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const entries = loadTrendHistory(rootDir, checkId);
  entries.push(entry);
  while (entries.length > HISTORY_MAX_ENTRIES) {
    entries.shift();
  }
  writeFileSync(path, JSON.stringify(entries, null, 2));
}
