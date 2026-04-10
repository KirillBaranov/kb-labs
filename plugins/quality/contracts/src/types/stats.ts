/**
 * Types for quality:stats command
 */

import type { Issue } from './common.js';

/**
 * Health score for a package or repository
 */
export interface HealthScore {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: Issue[];
}

/**
 * Package statistics
 */
export interface PackageStats {
  name: string;
  path?: string;
  repository: string;
  files: number;
  lines: number;
  bytes: number;
}

/**
 * Repository statistics
 */
export interface RepositoryStats {
  name: string;
  packages: number;
  files: number;
  lines: number;
  bytes: number;
}

/**
 * Dependency statistics
 */
export interface DependencyStats {
  total: number;
  workspace: number;
  external: number;
  duplicates: number;
  topUsed: Array<{ name: string; count: number }>;
}

/**
 * Statistics result from quality:stats
 */
export interface StatsResult {
  overview: {
    totalPackages: number;
    totalRepositories: number;
    totalFiles: number;
    totalLines: number;
    totalBytes: number;
  };
  byRepository: Record<string, RepositoryStats>;
  dependencies: DependencyStats;
  health: HealthScore;
  largestPackages: PackageStats[];
}
