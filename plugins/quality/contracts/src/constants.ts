/**
 * Constants for Quality Plugin
 */

/**
 * Environment variables
 */
export const QUALITY_ENV_VARS = [
  'KB_QUALITY_CACHE_TTL',
  'KB_QUALITY_MAX_PACKAGES',
] as const;

/**
 * Cache namespace prefix
 */
export const QUALITY_CACHE_PREFIX = 'quality:';

/**
 * Cache keys
 */
export const CACHE_KEYS = {
  STATS: 'quality:stats',
  HEALTH: 'quality:health',
  IMPORTS: 'quality:imports',
  EXPORTS: 'quality:exports',
  TYPES: 'quality:types',
  DUPLICATES: 'quality:duplicates',
  BUILDS: 'quality:builds',
  TYPE_ANALYSIS: 'quality:type-analysis',
  TESTS: 'quality:tests',
  DEAD_CODE: 'quality:dead-code',
} as const;

/**
 * Default timeouts (milliseconds)
 */
export const DEFAULT_TIMEOUTS = {
  STATS: 60000, // 1 min
  HEALTH: 120000, // 2 min
  CHECK_IMPORTS: 60000, // 1 min
  CHECK_EXPORTS: 60000, // 1 min
  CHECK_TYPES: 90000, // 1.5 min
  TYPES_AUDIT: 180000, // 3 min
  FIX_DEPS: 300000, // 5 min
  CI: 600000, // 10 min
  DEAD_CODE: 120000, // 2 min
} as const;

/**
 * Health score grades
 */
export const HEALTH_GRADES = {
  A: { min: 90, max: 100, label: 'Excellent' },
  B: { min: 80, max: 89, label: 'Good' },
  C: { min: 70, max: 79, label: 'Fair' },
  D: { min: 60, max: 69, label: 'Poor' },
  F: { min: 0, max: 59, label: 'Failing' },
} as const;
