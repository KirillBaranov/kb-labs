import { cmd, group, mergeCliGroups, GET, POST, combinePermissions } from '@kb-labs/sdk';
import {
  healthFlags,
  metricsFlags,
  statusFlags,
  logsFlags,
  listFlags,
  runFlags,
  workflowRunFlags,
  runsListFlags,
  runsViewFlags,
  runsWatchFlags,
  runsRerunFlags,
} from './flags';
import {
  WORKFLOW_BASE_PATH,
  WORKFLOW_ROUTES,
} from '@kb-labs/workflow-contracts';

const pluginPermissions = combinePermissions()
  .withEnv(['WORKFLOW_DAEMON_URL'])
  .withNetwork({
    fetch: ['http://localhost:*', 'http://127.0.0.1:*'],
  })
  .withQuotas({
    timeoutMs: 30000,
    memoryMb: 128,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/workflow',
  version: '1.0.0',
  display: {
    name: 'Workflow CLI',
    description: 'CLI commands for interacting with KB Labs Workflow Daemon',
    tags: ['workflow', 'daemon', 'jobs', 'orchestration'],
  },

  platform: {
    requires: [],
    optional: [],
  },

  cli: mergeCliGroups(
    group({ path: 'workflow', describe: 'Workflow daemon commands' }, [
      cmd('workflow health', './commands/health.js#default', 'Check workflow daemon health status.')
        .read()
        .category('Daemon')
        .long(
          'Performs a health check on the workflow daemon by making an HTTP request to /health endpoint. ' +
          'Use this to verify the daemon is running and responding.',
        )
        .flags(healthFlags)
        .examples(['kb workflow health', 'kb workflow health --json']),

      cmd('workflow metrics', './commands/metrics.js#default', 'Get workflow daemon metrics.')
        .read()
        .category('Daemon')
        .long(
          'Fetches comprehensive metrics from the workflow daemon including total runs, queued jobs, ' +
          'running jobs, completed jobs, and failure counts.',
        )
        .flags(metricsFlags)
        .examples(['kb workflow metrics', 'kb workflow metrics --json']),

      cmd('workflow status', './commands/status.js#default', 'Get status of a specific workflow job.')
        .read()
        .category('Jobs')
        .long(
          'Retrieves detailed status information for a specific job by ID, including current state, ' +
          'start time, and completion time if finished.',
        )
        .flags(statusFlags)
        .examples(['kb workflow status --job-id=abc123', 'kb workflow status --job-id=abc123 --json']),

      cmd('workflow logs', './commands/logs.js#default', 'Get logs for a specific workflow job.')
        .read()
        .category('Jobs')
        .long('Fetches execution logs for a specific job by ID.')
        .flags(logsFlags)
        .examples([
          'kb workflow logs --job-id=abc123',
          'kb workflow logs --job-id=abc123 --json',
          'kb workflow logs --job-id=abc123 --follow',
        ]),

      cmd('workflow list', './commands/list.js#default', 'List active workflow executions.')
        .read()
        .category('Jobs')
        .long(
          'Lists all currently active workflow executions or cron jobs. Can be filtered by status (running, queued, ' +
          'completed, failed, cancelled) or type (runs, cron).',
        )
        .flags(listFlags)
        .examples([
          'kb workflow list',
          'kb workflow list --status=running',
          'kb workflow list --type=cron',
          'kb workflow list --json',
        ]),

      cmd('workflow run', './commands/workflow-run.js#default', 'Run workflow by ID.')
        .execute()
        .category('Runs')
        .long(
          'Runs a workflow definition by workflow ID via /api/v1/workflows/:id/run endpoint. ' +
          'Supports request-level target and isolation overrides.',
        )
        .flags(workflowRunFlags)
        .examples([
          'kb workflow run --workflow-id=release-manager/create-release',
          'kb workflow run --workflow-id=release-manager/create-release --isolation=strict --target-namespace=team-a/prod',
          'kb workflow run --workflow-id=release-manager/create-release --target-environment-id=env-123 --json',
        ]),
    ]),

    group({ path: 'workflow runs', describe: 'Workflow run management (list, view, watch, rerun)', category: 'Runs' }, [
      cmd('workflow runs list', './commands/runs-list.js#default', 'List workflow runs.')
        .read()
        .long(
          'Lists workflow runs with status, trigger, and duration. Filter by status (failed, running, success) ' +
          'or workflow ID. Use --json for machine-readable output.',
        )
        .flags(runsListFlags)
        .examples([
          'kb workflow runs list',
          'kb workflow runs list --status=failed',
          'kb workflow runs list --status=failed --limit=5',
          'kb workflow runs list --workflow=my-workflow --json',
        ]),

      cmd('workflow runs view', './commands/runs-view.js#default', 'View run details for incident investigation.')
        .read()
        .long(
          'Shows full run details: jobs, steps, resolvedInputs, gate decisions, errors. ' +
          'Use --log-failed to see only the logs from failed steps (fastest path to root cause). ' +
          'Use --json=status,jobs for selective JSON output.',
        )
        .flags(runsViewFlags)
        .examples([
          'kb workflow runs view <runId>',
          'kb workflow runs view <runId> --log-failed',
          'kb workflow runs view <runId> --log',
          'kb workflow runs view <runId> --json=status,jobs',
          'kb workflow runs view <runId> --json=all',
        ]),

      cmd('workflow runs watch', './commands/runs-watch.js#default', 'Stream workflow run events in real-time.')
        .execute()
        .long(
          'Connects to the run event stream via SSE and prints events as they happen. ' +
          'Automatically exits when the run finishes.',
        )
        .flags(runsWatchFlags)
        .examples(['kb workflow runs watch <runId>', 'kb workflow runs watch <runId> --json']),

      cmd('workflow runs rerun', './commands/runs-rerun.js#default', 'Rerun a workflow run.')
        .mutate()
        .long(
          'Reruns a workflow by re-submitting it with the same inputs. ' +
          'Use --failed-only to skip jobs that already succeeded (not yet supported by daemon).',
        )
        .flags(runsRerunFlags)
        .examples([
          'kb workflow runs rerun <runId>',
          'kb workflow runs rerun <runId> --failed-only',
          'kb workflow runs rerun <runId> --json',
        ]),
    ]),

    group({ path: 'workflow job', describe: 'Raw job execution', category: 'Jobs' }, [
      cmd('workflow job run', './commands/run.js#default', 'Submit a raw job for execution.')
        .execute()
        .long(
          'Submits a job to the workflow daemon for execution. Requires a handler (plugin command) and ' +
          'optionally accepts input parameters as JSON. Can wait for job completion with --wait flag.',
        )
        .flags(runFlags)
        .examples([
          "kb workflow job run --handler=mind:search --input='{\"text\":\"test\"}'",
          "kb workflow job run --handler=mind:search --input='{\"text\":\"test\"}' --wait",
          "kb workflow job run --handler=mind:search --input='{\"text\":\"test\"}' --priority=8",
          "kb workflow job run --handler=mind:search --input='{\"text\":\"test\"}' --json",
        ]),
    ]),
  ),

  rest: {
    basePath: WORKFLOW_BASE_PATH,
    routes: [
      GET(WORKFLOW_ROUTES.STATS, './rest/stats-handler.js#default', {
        description: 'Get dashboard statistics',
        output: { zod: '@kb-labs/workflow-contracts#DashboardStatsResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.WORKFLOWS, './rest/workflows-list-handler.js#default', {
        description: 'List all workflow definitions',
        output: { zod: '@kb-labs/workflow-contracts#WorkflowListResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.WORKFLOW_DETAIL, './rest/workflow-detail-handler.js#default', {
        description: 'Get workflow definition details',
        output: { zod: '@kb-labs/workflow-contracts#WorkflowInfoSchema' },
      }),
      POST(WORKFLOW_ROUTES.WORKFLOW_RUN, './rest/workflow-run-handler.js#default', {
        description: 'Run a workflow',
        input: { zod: '@kb-labs/workflow-contracts#WorkflowRunRequestSchema' },
      }),
      GET(WORKFLOW_ROUTES.WORKFLOW_RUNS, './rest/workflow-runs-handler.js#default', {
        description: 'Get workflow run history with pagination',
        output: { zod: '@kb-labs/workflow-contracts#WorkflowRunHistoryResponseSchema' },
      }),
      POST(WORKFLOW_ROUTES.WORKFLOW_RUN_CANCEL, './rest/workflow-run-cancel-handler.js#default', {
        description: 'Cancel a running or queued workflow run',
      }),
      GET(WORKFLOW_ROUTES.RUNS, './rest/runs-list-handler.js#default', {
        description: 'List all workflow runs across all workflows',
      }),
      GET(WORKFLOW_ROUTES.RUN_DETAIL, './rest/run-detail-handler.js#default', {
        description: 'Get detailed information about a specific workflow run',
      }),
      GET(WORKFLOW_ROUTES.JOBS, './rest/jobs-list-handler.js#default', {
        description: 'List workflow jobs with optional filters',
        output: { zod: '@kb-labs/workflow-contracts#JobListResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.JOB_DETAIL, './rest/job-detail-handler.js#default', {
        description: 'Get detailed information about a specific job',
        output: { zod: '@kb-labs/workflow-contracts#JobStatusInfoSchema' },
      }),
      GET(WORKFLOW_ROUTES.JOB_LOGS, './rest/job-logs-handler.js#default', {
        description: 'Get execution logs for a specific job',
        output: { zod: '@kb-labs/workflow-contracts#JobLogsResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.JOB_STEPS, './rest/job-steps-handler.js#default', {
        description: 'Get execution steps and progress for a specific job',
        output: { zod: '@kb-labs/workflow-contracts#JobStepsResponseSchema' },
      }),
      POST(WORKFLOW_ROUTES.JOB_CANCEL, './rest/job-cancel-handler.js#default', {
        description: 'Cancel a running or pending job',
        output: { zod: '@kb-labs/workflow-contracts#JobCancelResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.CRON, './rest/cron-list-handler.js#default', {
        description: 'List all registered cron jobs',
        output: { zod: '@kb-labs/workflow-contracts#CronListResponseSchema' },
      }),
      GET(WORKFLOW_ROUTES.PENDING_APPROVALS, './rest/pending-approvals-handler.js#default', {
        description: 'List steps waiting for approval in a workflow run',
      }),
      POST(WORKFLOW_ROUTES.RESOLVE_APPROVAL, './rest/resolve-approval-handler.js#default', {
        description: 'Approve or reject a pending approval step',
      }),
    ],
  },

  ws: {
    basePath: '/v1/ws/plugins/workflow',
    defaults: {
      timeoutMs: 600000,
      maxMessageSize: 1048576,
      auth: 'none',
      idleTimeoutMs: 300000,
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

  studio: {
    version: 2 as const,
    remoteName: 'workflowPlugin',
    pages: [
      { id: 'workflow.dashboard', title: 'Dashboard', icon: 'DashboardOutlined', route: '/p/workflows', entry: './Dashboard', order: 1 },
      { id: 'workflow.runs', title: 'Runs', icon: 'PlayCircleOutlined', route: '/p/workflows/runs', entry: './Runs', order: 2 },
      { id: 'workflow.run', title: 'Run Detail', icon: 'PlayCircleOutlined', route: '/p/workflows/runs/:runId', entry: './RunDetail', order: 3 },
      { id: 'workflow.defs', title: 'Definitions', icon: 'AppstoreOutlined', route: '/p/workflows/definitions', entry: './Definitions', order: 4 },
      { id: 'workflow.def', title: 'Definition Detail', icon: 'AppstoreOutlined', route: '/p/workflows/definitions/:workflowId', entry: './DefinitionDetail', order: 5 },
      { id: 'workflow.jobs', title: 'Jobs', icon: 'UnorderedListOutlined', route: '/p/workflows/jobs', entry: './Jobs', order: 6 },
      { id: 'workflow.crons', title: 'Crons', icon: 'ClockCircleOutlined', route: '/p/workflows/crons', entry: './Crons', order: 7 },
    ],
    menus: [
      { id: 'workflows', label: 'Workflows', icon: 'ThunderboltOutlined', target: 'workflow.dashboard', order: 10 },
      { id: 'workflows.runs', label: 'Runs', icon: 'PlayCircleOutlined', target: 'workflow.runs', parentId: 'workflows', order: 1 },
      { id: 'workflows.defs', label: 'Definitions', icon: 'AppstoreOutlined', target: 'workflow.defs', parentId: 'workflows', order: 2 },
      { id: 'workflows.jobs', label: 'Jobs', icon: 'UnorderedListOutlined', target: 'workflow.jobs', parentId: 'workflows', order: 3 },
      { id: 'workflows.crons', label: 'Crons', icon: 'ClockCircleOutlined', target: 'workflow.crons', parentId: 'workflows', order: 4 },
    ],
  },

  permissions: pluginPermissions,
};
