/**
 * Calculate monorepo statistics
 *
 * Atomic functions for counting packages, LOC, size, etc.
 */

import { readFile, stat } from 'node:fs/promises';
import globby from 'globby';

export interface MonorepoStats {
  packages: number;
  loc: number;
  size: number;
  sizeFormatted: string;
}

/**
 * Calculate total lines of code in all source files
 */
export async function calculateLinesOfCode(rootDir: string, sourceFiles?: string[]): Promise<number> {
  const files = sourceFiles ?? await globby('**/*.{ts,tsx,js,jsx}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.kb/**', '**/build/**',
      '**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}'],
    absolute: true,
    deep: 8,
  });

  const contents = await Promise.all(files.map(f => readFile(f, 'utf-8').catch(() => null)));
  return contents.reduce((sum, c) => sum + (c ? c.split('\n').length : 0), 0);
}

/**
 * Calculate total size of source files in bytes
 */
export async function calculateSize(rootDir: string, sourceFiles?: string[]): Promise<number> {
  const files = sourceFiles ?? await globby('**/*.{ts,tsx,js,jsx}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.kb/**', '**/build/**'],
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
  // Single scan for source files shared by LOC and size
  const sourceFiles = await globby('**/*.{ts,tsx,js,jsx}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.kb/**', '**/build/**'],
    absolute: true,
    deep: 8,
  });

  const [packages, loc, size] = await Promise.all([
    countPackages(rootDir),
    calculateLinesOfCode(rootDir, sourceFiles),
    calculateSize(rootDir, sourceFiles),
  ]);

  return {
    packages,
    loc,
    size,
    sizeFormatted: formatBytes(size),
  };
}
