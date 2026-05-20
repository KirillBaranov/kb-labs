/**
 * Calculate monorepo statistics
 *
 * Atomic functions for counting packages, LOC, size, etc.
 */

import { stat } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import globby from 'globby';

const execAsync = promisify(exec);

const SOURCE_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.kb/**',
  '**/build/**',
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
];

export interface MonorepoStats {
  packages: number;
  loc: number;
  size: number;
  sizeFormatted: string;
}

/**
 * Calculate total lines of code in all source files
 */
export async function calculateLinesOfCode(rootDir: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `find . \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) ` +
      `-not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.git/*" ` +
      `-not -path "*/.kb/*" -not -path "*/build/*" ` +
      `-not -name "*.test.ts" -not -name "*.test.tsx" -not -name "*.test.js" ` +
      `-not -name "*.spec.ts" -not -name "*.spec.tsx" -not -name "*.spec.js" ` +
      `-print0 | xargs -0 cat 2>/dev/null | wc -l`,
      { cwd: rootDir, maxBuffer: 64 * 1024 * 1024 }
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Calculate total size of source files in bytes
 */
export async function calculateSize(rootDir: string): Promise<number> {
  const files = await globby('**/*.{ts,tsx,js,jsx}', {
    cwd: rootDir,
    ignore: SOURCE_IGNORE,
    absolute: true,
    deep: 8,
  });

  const stats = await Promise.all(files.map(f => stat(f).catch(() => null)));
  return stats.reduce((sum, s) => sum + (s ? s.size : 0), 0);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(2)} ${units[i]}`;
}

/**
 * Count packages in monorepo
 */
export async function countPackages(rootDir: string): Promise<number> {
  const packageJsonFiles = await globby('**/package.json', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.kb/**'],
    absolute: false,
    deep: 6,
  });

  // Exclude root package.json if it exists
  return packageJsonFiles.filter(p => p !== 'package.json').length;
}

/**
 * Calculate all stats at once
 */
export async function calculateStats(rootDir: string): Promise<MonorepoStats> {
  const [packages, loc, size] = await Promise.all([
    countPackages(rootDir),
    calculateLinesOfCode(rootDir),
    calculateSize(rootDir),
  ]);

  return {
    packages,
    loc,
    size,
    sizeFormatted: formatBytes(size),
  };
}
