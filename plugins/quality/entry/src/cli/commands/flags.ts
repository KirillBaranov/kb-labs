/**
 * Shared command flags definitions
 *
 * DRY pattern: Define flags once, use in both manifest and command handlers.
 */

/**
 * Flags for quality:stats command
 */
export const statsFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  md: {
    type: 'boolean',
    description: 'Output Markdown table',
    default: false,
  },
  health: {
    type: 'boolean',
    description: 'Show health score',
    default: false,
  },
  refresh: {
    type: 'boolean',
    description: 'Bypass cache and recalculate',
    default: false,
  },
} as const;

export type StatsFlags = typeof statsFlags;

/**
 * Flags for quality:health command
 */
export const healthFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  package: {
    type: 'string',
    description: 'Check health for specific package',
    alias: 'p',
  },
  detailed: {
    type: 'boolean',
    description: 'Show detailed breakdown',
    default: false,
    alias: 'd',
  },
} as const;

export type HealthFlags = typeof healthFlags;

/**
 * Flags for quality:fix-deps command
 */
export const fixDepsFlags = {
  'dry-run': {
    type: 'boolean',
    description: 'Preview changes without applying them',
    default: false,
  },
  'remove-unused': {
    type: 'boolean',
    description: 'Remove unused dependencies',
    default: false,
  },
  'add-missing': {
    type: 'boolean',
    description: 'Add missing workspace dependencies',
    default: false,
  },
  'align-versions': {
    type: 'boolean',
    description: 'Align duplicate dependency versions',
    default: false,
  },
  all: {
    type: 'boolean',
    description: 'Apply all fixes (remove-unused + add-missing + align-versions)',
    default: false,
  },
  stats: {
    type: 'boolean',
    description: 'Show dependency statistics',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type FixDepsFlags = typeof fixDepsFlags;

/**
 * Flags for quality:run command
 */
export const runFlags = {
  script: {
    type: 'string',
    description: 'Script to run (build, test, type-check, lint)',
    required: true,
  },
  'continue-on-error': {
    type: 'boolean',
    description: 'Continue even if packages fail',
    default: true,
  },
  parallel: {
    type: 'boolean',
    description: 'Run in parallel (respects dependencies)',
    default: false,
  },
  filter: {
    type: 'string',
    description: 'Filter packages by pattern (@kb-labs/*)',
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  verbose: {
    type: 'boolean',
    description: 'Show full output for each package',
    default: false,
    alias: 'v',
  },
} as const;

export type RunFlags = typeof runFlags;

/**
 * Flags for quality:build-order command
 */
export const buildOrderFlags = {
  package: {
    type: 'string',
    description: 'Calculate build order for specific package',
    alias: 'p',
  },
  layers: {
    type: 'boolean',
    description: 'Show build layers (parallel groups)',
    default: false,
  },
  script: {
    type: 'boolean',
    description: 'Output as shell script',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type BuildOrderFlags = typeof buildOrderFlags;

/**
 * Flags for quality:cycles command
 */
export const cyclesFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type CyclesFlags = typeof cyclesFlags;

/**
 * Flags for quality:visualize command
 */
export const visualizeFlags = {
  package: {
    type: 'string',
    description: 'Focus on specific package',
    alias: 'p',
  },
  tree: {
    type: 'boolean',
    description: 'Show dependency tree',
    default: false,
  },
  dot: {
    type: 'boolean',
    description: 'Output DOT format for graphviz',
    default: false,
  },
  stats: {
    type: 'boolean',
    description: 'Show graph statistics',
    default: false,
  },
  reverse: {
    type: 'boolean',
    description: 'Show reverse dependencies (who depends on this)',
    default: false,
  },
  impact: {
    type: 'boolean',
    description: 'Show impact analysis (what will be affected)',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type VisualizeFlags = typeof visualizeFlags;

/**
 * Flags for quality:check-builds command
 */
export const checkBuildsFlags = {
  package: {
    type: 'string',
    description: 'Check builds for specific package',
    alias: 'p',
  },
  timeout: {
    type: 'number',
    description: 'Timeout per package in milliseconds',
    default: 30000,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  refresh: {
    type: 'boolean',
    description: 'Bypass cache and check fresh',
    default: false,
  },
} as const;

export type CheckBuildsFlags = typeof checkBuildsFlags;

/**
 * Flags for quality:check-types command
 */
export const checkTypesFlags = {
  package: {
    type: 'string',
    description: 'Analyze types for specific package',
    alias: 'p',
  },
  'errors-only': {
    type: 'boolean',
    description: 'Show only packages with errors',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  refresh: {
    type: 'boolean',
    description: 'Bypass cache and analyze fresh',
    default: false,
  },
} as const;

export type CheckTypesFlags = typeof checkTypesFlags;

/**
 * Flags for quality:check-tests command
 */
export const checkTestsFlags = {
  package: {
    type: 'string',
    description: 'Run tests for specific package',
    alias: 'p',
  },
  timeout: {
    type: 'number',
    description: 'Timeout per package in milliseconds',
    default: 60000,
  },
  'with-coverage': {
    type: 'boolean',
    description: 'Collect coverage statistics',
    default: false,
  },
  'coverage-only': {
    type: 'boolean',
    description: 'Only show existing coverage (skip test execution)',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  refresh: {
    type: 'boolean',
    description: 'Bypass cache and run fresh',
    default: false,
  },
} as const;

export type CheckTestsFlags = typeof checkTestsFlags;

/**
 * Flags for quality:dead-code command
 */
export const deadCodeFlags = {
  package: {
    type: 'string',
    description: 'Scan specific package only',
    alias: 'p',
  },
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  verbose: {
    type: 'boolean',
    description: 'Show entry points and alive reasons',
    default: false,
    alias: 'v',
  },
  'auto-remove': {
    type: 'boolean',
    description: 'Remove dead files (creates backup first)',
    default: false,
  },
  'dry-run': {
    type: 'boolean',
    description: 'Show what would be removed without actually deleting',
    default: false,
  },
  restore: {
    type: 'string',
    description: 'Restore files from backup ID',
  },
  'list-backups': {
    type: 'boolean',
    description: 'List available backups',
    default: false,
  },
  refresh: {
    type: 'boolean',
    description: 'Bypass cache and rescan',
    default: false,
  },
} as const;

export type DeadCodeFlags = typeof deadCodeFlags;
