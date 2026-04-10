/**
 * KB Labs Workflow CLI - Manifest V3
 *
 * Provides CLI commands for interacting with Workflow Daemon via HTTP API.
 */

import { defineCommandFlags, combinePermissions } from '@kb-labs/sdk';
import {
  healthFlags,
  metricsFlags,
  statusFlags,
  logsFlags,
  listFlags,
  runFlags,
  workflowRunFlags,
} from './flags';
import {
  WORKFLOW_BASE_PATH,
  WORKFLOW_ROUTES,
} from '@kb-labs/workflow-contracts';

/**
 * Minimal permissions - workflow-cli only makes HTTP requests
 * No file system or git access needed
 */
const pluginPermissions = combinePermissions()
  .withEnv(['WORKFLOW_DAEMON_URL'])
  .withNetwork({
    fetch: ['http://localhost:*', 'http://127.0.0.1:*'],
  })
  .withQuotas({
    timeoutMs: 30000, // 30 seconds for HTTP requests
    memoryMb: 128,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/workflow',
  version: '1.0.0',

  display: {
    name: 'Workflow CLI',
    description: 'CLI commands for interacting with KB Labs Workflow Daemon.',
    tags: ['workflow', 'daemon', 'jobs', 'orchestration'],
  },

  // No platform requirements - just HTTP client
  platform: {
    requires: [],
    optional: [],
  },

  cli: {
    commands: [
      // workflow:health - Check daemon health
      {
        id: 'workflow:health',
        group: 'workflow',
        describe: 'Check workflow daemon health status.',
        longDescription:
          'Performs a health check on the workflow daemon by making an HTTP request to /health endpoint. ' +
          'Use this to verify the daemon is running and responding.',

        handler: './commands/health.js#default',
        handlerPath: './commands/health.js',

        flags: defineCommandFlags(healthFlags),

        examples: [
          'kb workflow health',
          'kb workflow health --json',
        ],
      },

      // workflow:metrics - Get metrics
      {
        id: 'workflow:metrics',
        group: 'workflow',
        describe: 'Get workflow daemon metrics.',
        longDescription:
          'Fetches comprehensive metrics from the workflow daemon including total runs, queued jobs, ' +
          'running jobs, completed jobs, and failure counts.',

        handler: './commands/metrics.js#default',
        handlerPath: './commands/metrics.js',

        flags: defineCommandFlags(metricsFlags),

        examples: [
          'kb workflow metrics',
          'kb workflow metrics --json',
        ],
      },

      // workflow:status - Get job status
      {
        id: 'workflow:status',
        group: 'workflow',
        describe: 'Get status of a specific workflow job.',
        longDescription:
          'Retrieves detailed status information for a specific job by ID, including current state, ' +
          'start time, and completion time if finished.',

        handler: './commands/status.js#default',
        handlerPath: './commands/status.js',

        flags: defineCommandFlags(statusFlags),

        examples: [
          'kb workflow status --job-id=abc123',
          'kb workflow status --job-id=abc123 --json',
        ],
      },

      // workflow:logs - Get job logs
      {
        id: 'workflow:logs',
        group: 'workflow',
        describe: 'Get logs for a specific workflow job.',
        longDescription:
          'Fetches execution logs for a specific job by ID. Note: Log integration with platform.logger ' +
          'is pending, currently returns placeholder data.',

        handler: './commands/logs.js#default',
        handlerPath: './commands/logs.js',

        flags: defineCommandFlags(logsFlags),

        examples: [
          'kb workflow logs --job-id=abc123',
          'kb workflow logs --job-id=abc123 --json',
          'kb workflow logs --job-id=abc123 --follow',
        ],
      },

      // workflow:list - List active executions
      {
        id: 'workflow:list',
        group: 'workflow',
        describe: 'List active workflow executions.',
        longDescription:
          'Lists all currently active workflow executions or cron jobs. Can be filtered by status (running, queued, ' +
          'completed, failed, cancelled) or type (runs, cron).',

        handler: './commands/list.js#default',
        handlerPath: './commands/list.js',

        flags: defineCommandFlags(listFlags),

        examples: [
          'kb workflow list',
          'kb workflow list --status=running',
          'kb workflow list --type=cron',
          'kb workflow list --json',
        ],
      },

      // workflow:job-run - Submit raw job for execution
      {
        id: 'workflow:job-run',
        group: 'workflow',
        describe: 'Submit a raw job for execution.',
        longDescription:
          'Submits a job to the workflow daemon for execution. Requires a handler (plugin command) and ' +
          'optionally accepts input parameters as JSON. Can wait for job completion with --wait flag.',

        handler: './commands/run.js#default',
        handlerPath: './commands/run.js',

        flags: defineCommandFlags(runFlags),

        examples: [
          'kb workflow job-run --handler=mind:rag-query --input=\'{"text":"test"}\'',
          'kb workflow job-run --handler=mind:rag-query --input=\'{"text":"test"}\' --wait',
          'kb workflow job-run --handler=mind:rag-query --input=\'{"text":"test"}\' --priority=8',
          'kb workflow job-run --handler=mind:rag-query --input=\'{"text":"test"}\' --json',
        ],
      },

      // workflow:run - Run workflow by workflow ID
      {
        id: 'workflow:run',
        group: 'workflow',
        describe: 'Run workflow by ID.',
        longDescription:
          'Runs a workflow definition by workflow ID via /api/v1/workflows/:id/run endpoint. ' +
          'Supports request-level target and isolation overrides.',

        handler: './commands/workflow-run.js#default',
        handlerPath: './commands/workflow-run.js',

        flags: defineCommandFlags(workflowRunFlags),

        examples: [
          'kb workflow run --workflow-id=release-manager/create-release',
          'kb workflow run --workflow-id=release-manager/create-release --isolation=strict --target-namespace=team-a/prod',
          'kb workflow run --workflow-id=release-manager/create-release --target-environment-id=env-123 --json',
        ],
      },
    ],
  },

  // REST API routes (proxy to workflow daemon)
  rest: {
    basePath: WORKFLOW_BASE_PATH,
    routes: [
      // GET /stats - Dashboard statistics
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.STATS,
        handler: './rest/stats-handler.js#default',
        describe: 'Get dashboard statistics',
        output: {
          zod: '@kb-labs/workflow-contracts#DashboardStatsResponseSchema',
        },
      },
      // GET /workflows - List workflow definitions
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.WORKFLOWS,
        handler: './rest/workflows-list-handler.js#default',
        describe: 'List all workflow definitions',
        output: {
          zod: '@kb-labs/workflow-contracts#WorkflowListResponseSchema',
        },
      },
      // GET /workflows/:id - Get workflow detail
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.WORKFLOW_DETAIL,
        handler: './rest/workflow-detail-handler.js#default',
        describe: 'Get workflow definition details',
        output: {
          zod: '@kb-labs/workflow-contracts#WorkflowInfoSchema',
        },
      },
      // POST /workflows/:id/run - Run workflow
      {
        method: 'POST',
        path: WORKFLOW_ROUTES.WORKFLOW_RUN,
        handler: './rest/workflow-run-handler.js#default',
        describe: 'Run a workflow',
        input: {
          zod: '@kb-labs/workflow-contracts#WorkflowRunRequestSchema',
        },
      },
      // GET /workflows/:workflowId/runs - Get workflow run history
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.WORKFLOW_RUNS,
        handler: './rest/workflow-runs-handler.js#default',
        describe: 'Get workflow run history with pagination',
        output: {
          zod: '@kb-labs/workflow-contracts#WorkflowRunHistoryResponseSchema',
        },
      },
      // POST /workflows/runs/:runId/cancel - Cancel a workflow run
      {
        method: 'POST',
        path: WORKFLOW_ROUTES.WORKFLOW_RUN_CANCEL,
        handler: './rest/workflow-run-cancel-handler.js#default',
        describe: 'Cancel a running or queued workflow run',
      },
      // GET /runs - List all workflow runs
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.RUNS,
        handler: './rest/runs-list-handler.js#default',
        describe: 'List all workflow runs across all workflows',
      },
      // GET /runs/:runId - Get a specific workflow run
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.RUN_DETAIL,
        handler: './rest/run-detail-handler.js#default',
        describe: 'Get detailed information about a specific workflow run',
      },
      // GET /workflows/jobs - List jobs
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.JOBS,
        handler: './rest/jobs-list-handler.js#default',
        describe: 'List workflow jobs with optional filters',
        output: {
          zod: '@kb-labs/workflow-contracts#JobListResponseSchema',
        },
      },
      // GET /workflows/jobs/:jobId - Get job detail
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.JOB_DETAIL,
        handler: './rest/job-detail-handler.js#default',
        describe: 'Get detailed information about a specific job',
        output: {
          zod: '@kb-labs/workflow-contracts#JobStatusInfoSchema',
        },
      },
      // GET /workflows/jobs/:jobId/logs - Get job logs
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.JOB_LOGS,
        handler: './rest/job-logs-handler.js#default',
        describe: 'Get execution logs for a specific job',
        output: {
          zod: '@kb-labs/workflow-contracts#JobLogsResponseSchema',
        },
      },
      // GET /workflows/jobs/:jobId/steps - Get job steps
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.JOB_STEPS,
        handler: './rest/job-steps-handler.js#default',
        describe: 'Get execution steps and progress for a specific job',
        output: {
          zod: '@kb-labs/workflow-contracts#JobStepsResponseSchema',
        },
      },
      // POST /workflows/jobs/:jobId/cancel - Cancel job
      {
        method: 'POST',
        path: WORKFLOW_ROUTES.JOB_CANCEL,
        handler: './rest/job-cancel-handler.js#default',
        describe: 'Cancel a running or pending job',
        output: {
          zod: '@kb-labs/workflow-contracts#JobCancelResponseSchema',
        },
      },
      // GET /workflows/cron - List cron jobs
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.CRON,
        handler: './rest/cron-list-handler.js#default',
        describe: 'List all registered cron jobs',
        output: {
          zod: '@kb-labs/workflow-contracts#CronListResponseSchema',
        },
      },
      // GET /runs/:runId/pending-approvals - List pending approvals
      {
        method: 'GET',
        path: WORKFLOW_ROUTES.PENDING_APPROVALS,
        handler: './rest/pending-approvals-handler.js#default',
        describe: 'List steps waiting for approval in a workflow run',
      },
      // POST /runs/:runId/approve - Resolve approval
      {
        method: 'POST',
        path: WORKFLOW_ROUTES.RESOLVE_APPROVAL,
        handler: './rest/resolve-approval-handler.js#default',
        describe: 'Approve or reject a pending approval step',
      },
    ],
  },

  // WebSocket channels for real-time updates
  ws: {
    basePath: '/v1/ws/plugins/workflow',
    defaults: {
      timeoutMs: 600000, // 10 minutes
      maxMessageSize: 1048576, // 1MB
      auth: 'none',
      idleTimeoutMs: 300000, // 5 minutes
    },
    channels: [
      {
        path: '/logs/:jobId',
        handler: './ws/logs-channel.js#default',
        description: 'Real-time job logs streaming',
      },
      {
        path: '/progress/:jobId',
        handler: './ws/progress-channel.js#default',
        description: 'Real-time job progress updates',
      },
    ],
  },

  // Studio V2 — Module Federation pages
  studio: {
    version: 2 as const,
    remoteName: 'workflowPlugin',
    pages: [
      {
        id: 'workflow.dashboard',
        title: 'Dashboard',
        icon: 'DashboardOutlined',
        route: '/p/workflows',
        entry: './Dashboard',
        order: 1,
      },
      {
        id: 'workflow.runs',
        title: 'Runs',
        icon: 'PlayCircleOutlined',
        route: '/p/workflows/runs',
        entry: './Runs',
        order: 2,
      },
      {
        id: 'workflow.run',
        title: 'Run Detail',
        icon: 'PlayCircleOutlined',
        route: '/p/workflows/runs/:runId',
        entry: './RunDetail',
        order: 3,
      },
      {
        id: 'workflow.defs',
        title: 'Definitions',
        icon: 'AppstoreOutlined',
        route: '/p/workflows/definitions',
        entry: './Definitions',
        order: 4,
      },
      {
        id: 'workflow.def',
        title: 'Definition Detail',
        icon: 'AppstoreOutlined',
        route: '/p/workflows/definitions/:workflowId',
        entry: './DefinitionDetail',
        order: 5,
      },
      {
        id: 'workflow.jobs',
        title: 'Jobs',
        icon: 'UnorderedListOutlined',
        route: '/p/workflows/jobs',
        entry: './Jobs',
        order: 6,
      },
      {
        id: 'workflow.crons',
        title: 'Crons',
        icon: 'ClockCircleOutlined',
        route: '/p/workflows/crons',
        entry: './Crons',
        order: 7,
      },
    ],
    menus: [
      {
        id: 'workflows',
        label: 'Workflows',
        icon: 'ThunderboltOutlined',
        target: 'workflow.dashboard',
        order: 10,
      },
      {
        id: 'workflows.runs',
        label: 'Runs',
        icon: 'PlayCircleOutlined',
        target: 'workflow.runs',
        parentId: 'workflows',
        order: 1,
      },
      {
        id: 'workflows.defs',
        label: 'Definitions',
        icon: 'AppstoreOutlined',
        target: 'workflow.defs',
        parentId: 'workflows',
        order: 2,
      },
      {
        id: 'workflows.jobs',
        label: 'Jobs',
        icon: 'UnorderedListOutlined',
        target: 'workflow.jobs',
        parentId: 'workflows',
        order: 3,
      },
      {
        id: 'workflows.crons',
        label: 'Crons',
        icon: 'ClockCircleOutlined',
        target: 'workflow.crons',
        parentId: 'workflows',
        order: 4,
      },
    ],
  },

  permissions: pluginPermissions,
};
