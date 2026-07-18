import { defineFlags } from '@kb-labs/sdk';

export const qaRunFlags = defineFlags({
  tasks: {
    type: 'string',
    description: 'Comma-separated tasks to run (default: build,lint,type-check,test)',
  },
  save: {
    type: 'boolean',
    description: 'Save snapshot to history',
    default: true,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaRunFlags = typeof qaRunFlags.infer;

export const qaCheckFlags = defineFlags({
  save: {
    type: 'boolean',
    description: 'Save snapshot to history',
    default: true,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaCheckFlags = typeof qaCheckFlags.infer;

export const qaStatsFlags = defineFlags({
  save: {
    type: 'boolean',
    description: 'Save snapshot to history',
    default: true,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaStatsFlags = typeof qaStatsFlags.infer;

export const qaGateFlags = defineFlags({
  save: {
    type: 'boolean',
    description: 'Save snapshot to history',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaGateFlags = typeof qaGateFlags.infer;

export const qaHistoryFlags = defineFlags({
  limit: {
    type: 'number',
    description: 'Max entries to show',
    default: 20,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaHistoryFlags = typeof qaHistoryFlags.infer;

export const qaTrendsFlags = defineFlags({
  window: {
    type: 'number',
    description: 'Number of history entries to analyze',
    default: 10,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaTrendsFlags = typeof qaTrendsFlags.infer;

export const qaE2eFlakyFlags = defineFlags({
  agent: {
    type: 'boolean',
    description: 'Emit compact machine-readable agent JSON (alias for --json)',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
  case: {
    type: 'string',
    description: 'Drill down into one case: "<suite>/<spec>#<testId>" (from the overview\'s "top" list)',
  },
  window: {
    type: 'number',
    description: 'Number of e2e-flaky history entries (runs) to analyze',
    default: 10,
  },
  sync: {
    type: 'boolean',
    description: 'Fetch the latest flaky history from the "ci-data" branch before analyzing',
    default: false,
  },
  ingest: {
    type: 'string',
    description: 'CI-only: directory of per-shard flaky-report.json files to merge and save as a new snapshot',
  },
});
export type QaE2eFlakyFlags = typeof qaE2eFlakyFlags.infer;

export const qaRegressionsFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type QaRegressionsFlags = typeof qaRegressionsFlags.infer;

export const baselineUpdateFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type BaselineUpdateFlags = typeof baselineUpdateFlags.infer;

export const baselineStatusFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type BaselineStatusFlags = typeof baselineStatusFlags.infer;

export const baselineDiffFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output JSON',
    default: false,
  },
});
export type BaselineDiffFlags = typeof baselineDiffFlags.infer;
