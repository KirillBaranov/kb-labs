/**
 * Shared command flags definitions
 *
 * DRY pattern: Define flags once, use in both manifest and command handlers.
 */

const OUTPUT_JSON_DESCRIPTION = 'Output result as JSON';

/**
 * Flags for workflow:health command
 */
export const healthFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
} as const;

export type HealthFlags = typeof healthFlags;

/**
 * Flags for workflow:metrics command
 */
export const metricsFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
} as const;

export type MetricsFlags = typeof metricsFlags;

/**
 * Flags for workflow:status command
 */
export const statusFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
  'job-id': {
    type: 'string',
    description: 'Job ID to get status for',
  },
} as const;

export type StatusFlags = typeof statusFlags;

/**
 * Flags for workflow:logs command
 */
export const logsFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
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
} as const;

export type LogsFlags = typeof logsFlags;

/**
 * Flags for workflow:list command
 */
export const listFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
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
} as const;

export type ListFlags = typeof listFlags;

/**
 * Flags for workflow:job-run command
 */
export const runFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
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
} as const;

export type RunFlags = typeof runFlags;

/**
 * Flags for workflow:run command
 */
export const workflowRunFlags = {
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
  'workflow-id': {
    type: 'string',
    description: 'Workflow ID to run (e.g., "release-manager/create-release")',
  },
  input: {
    type: 'string',
    description: 'JSON string of workflow input payload',
  },
  isolation: {
    type: 'string',
    description: 'Isolation profile: strict, balanced, or relaxed',
  },
  'target-namespace': {
    type: 'string',
    description: 'Execution target namespace',
  },
  'target-environment-id': {
    type: 'string',
    description: 'Execution target environment ID',
  },
  'target-workspace-id': {
    type: 'string',
    description: 'Execution target workspace ID',
  },
  'target-workdir': {
    type: 'string',
    description: 'Execution target workdir override',
  },
  'trigger-type': {
    type: 'string',
    description: 'Trigger type: manual, api, or cron',
  },
  'trigger-user': {
    type: 'string',
    description: 'Trigger user',
  },
} as const;

export type WorkflowRunFlags = typeof workflowRunFlags;
