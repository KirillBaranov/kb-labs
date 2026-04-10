/**
 * Flag definitions for workflow CLI commands
 * Uses defineFlags from @kb-labs/sdk for type safety
 */

import { defineFlags } from '@kb-labs/sdk';

/**
 * Flags for workflow:status command
 */
export const statusFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
  'job-id': {
    type: 'string',
    description: 'Job ID to get status for',
  },
});

/**
 * Flags for workflow:logs command
 */
export const logsFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
  'job-id': {
    type: 'string',
    description: 'Job ID to get logs for (required)',
  },
  follow: {
    type: 'boolean',
    description: 'Follow log output (stream new logs)',
    default: false,
  },
});

/**
 * Flags for workflow:metrics command
 */
export const metricsFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
});

/**
 * Flags for workflow:health command
 */
export const healthFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
});

/**
 * Flags for workflow:list command
 */
export const listFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
  status: {
    type: 'string',
    description: 'Filter by status (running, completed, failed)',
  },
  type: {
    type: 'string',
    description: 'Filter by type: "runs" (active executions), "cron" (scheduled jobs)',
  },
});

/**
 * Flags for workflow:run command
 */
export const runFlags = defineFlags({
  json: {
    type: 'boolean',
    description: 'Output result as JSON',
    default: false,
  },
  handler: {
    type: 'string',
    description: 'Plugin handler to run (e.g., "mind:rag-query")',
  },
  input: {
    type: 'string',
    description: 'JSON string of input parameters',
  },
  priority: {
    type: 'number',
    description: 'Job priority (1-10, default: 5)',
  },
  wait: {
    type: 'boolean',
    description: 'Wait for job completion',
    default: false,
  },
});

// Type exports for use in command handlers
export type StatusFlags = typeof statusFlags.infer;
export type LogsFlags = typeof logsFlags.infer;
export type MetricsFlags = typeof metricsFlags.infer;
export type HealthFlags = typeof healthFlags.infer;
export type ListFlags = typeof listFlags.infer;
export type RunFlags = typeof runFlags.infer;
