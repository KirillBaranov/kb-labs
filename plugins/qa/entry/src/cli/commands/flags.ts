/**
 * QA Plugin CLI flag definitions.
 * DRY: Define once, use in manifest and command handlers.
 */

const JSON_FLAG_DESCRIPTION = 'Output JSON format';

export const qaRunFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
  'skip-check': {
    type: 'array',
    description: 'Skip specific check IDs (e.g. --skip-check build --skip-check lint)',
  },
  'no-cache': {
    type: 'boolean',
    description: 'Disable caching (force full run)',
    default: false,
  },
  all: {
    type: 'boolean',
    description: 'Run all packages, ignoring affected analysis',
    default: false,
  },
  package: {
    type: 'string',
    description: 'Filter by package name',
    alias: 'p',
  },
  repo: {
    type: 'string',
    description: 'Filter by repo name',
    alias: 'r',
  },
  scope: {
    type: 'string',
    description: 'Filter by npm scope',
    alias: 's',
  },
  summary: {
    type: 'boolean',
    description: 'Show summary-only report (legacy flat format)',
    default: false,
  },
} as const;

export type QARunFlags = typeof qaRunFlags;

export const qaSaveFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
} as const;

export type QASaveFlags = typeof qaSaveFlags;

export const qaHistoryFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
  limit: {
    type: 'number',
    description: 'Number of entries to show',
    default: 20,
  },
} as const;

export type QAHistoryFlags = typeof qaHistoryFlags;

export const qaTrendsFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
  window: {
    type: 'number',
    description: 'Number of entries for trend window',
    default: 10,
  },
} as const;

export type QATrendsFlags = typeof qaTrendsFlags;

export const qaRegressionsFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
} as const;

export type QARegressionsFlags = typeof qaRegressionsFlags;

export const baselineUpdateFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
} as const;

export type BaselineUpdateFlags = typeof baselineUpdateFlags;

export const baselineStatusFlags = {
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
} as const;

export type BaselineStatusFlags = typeof baselineStatusFlags;

export const qaCheckFlags = {
  id: {
    type: 'string',
    description: 'Check ID to run (must match a check in qa.checks config)',
    demandOption: true,
  },
  base: {
    type: 'string',
    description: 'Base branch/commit for diff strategies (diffOnly, newFiles). Default: main',
    default: 'main',
  },
  context: {
    type: 'string',
    description: 'JSON context to attach to history entry (e.g. {"taskId":"123"})',
  },
  json: {
    type: 'boolean',
    description: JSON_FLAG_DESCRIPTION,
    default: false,
  },
  save: {
    type: 'boolean',
    description: 'Save result to history after running (default: true)',
    default: true,
  },
} as const;

export type QACheckFlags = typeof qaCheckFlags;
