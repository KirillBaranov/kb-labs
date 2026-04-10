/**
 * @module @kb-labs/workflow-daemon/server
 * HTTP API server for workflow daemon management
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  HttpObservabilityCollector,
  createServiceReadyResponse,
  metricLine,
  registerOpenAPI,
} from '@kb-labs/shared-http';
import type { WorkflowEngine, WorkflowService } from '@kb-labs/workflow-engine';
import type { ILogger } from '@kb-labs/core-platform';
import type { ObservabilityCheck, ServiceHealthStatus, ServiceOperationSample } from '@kb-labs/core-contracts';
import type { JobBroker } from './job-broker.js';
import type { CronScheduler } from './cron-scheduler.js';
import type { CronDiscovery } from './cron-discovery.js';
import { WorkflowHostService, type WorkflowEngineMetrics } from './host/workflow-host-service.js';
import { registerJobsAPI } from './api/jobs-api.js';
import { registerCronAPI } from './api/cron-api.js';
import { registerWorkflowsAPI } from './api/workflows-api.js';
import { registerApprovalsAPI } from './api/approvals-api.js';
import { registerStatsAPI } from './api/stats-api.js';

export interface CreateServerOptions {
  engine: WorkflowEngine;
  jobBroker: JobBroker;
  workflowService?: WorkflowService;
  cronScheduler?: CronScheduler;
  cronDiscovery?: CronDiscovery;
  logger: ILogger;
}

/**
 * Create Fastify HTTP server for workflow daemon.
 * Provides endpoints for job management and monitoring.
 */
export async function createServer(options: CreateServerOptions) {
  const { engine, jobBroker, workflowService, cronScheduler, cronDiscovery, logger } = options;
  const hostService = new WorkflowHostService({
    engine,
    jobBroker,
    workflowService,
    cronScheduler,
    logger,
  });

  const server = Fastify({
    logger: false, // Use platform logger instead
    bodyLimit: 1048576, // 1MB body limit (prevents parsing huge payloads)
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // OpenAPI / Swagger UI — must be registered before routes
  await registerOpenAPI(server, {
    title: 'KB Labs Workflow Daemon',
    description: 'Background job execution and workflow orchestration API',
    version: '1.0.0',
    servers: [{ url: 'http://localhost:7778', description: 'Local dev' }],
    ui: !isProduction,
  });
  const requireAuth = process.env.KB_DAEMON_REQUIRE_AUTH === 'true' || isProduction;
  const daemonApiKey = process.env.KB_DAEMON_API_KEY;
  const observability = new HttpObservabilityCollector({
    serviceId: 'workflow',
    serviceType: 'workflow-daemon',
    version: '1.0.0',
    logsSource: 'workflow',
    dependencies: [
      {
        serviceId: 'state-daemon',
        required: false,
        description: 'Workflow run and job state storage',
      },
    ],
  });

  if (requireAuth && !daemonApiKey) {
    throw new Error(
      'KB_DAEMON_API_KEY is required when daemon auth is enabled (KB_DAEMON_REQUIRE_AUTH=true or NODE_ENV=production)'
    );
  }

  server.addHook('onRequest', async (request, reply) => {
    if (!requireAuth) {
      return;
    }

    if (request.url === '/health') {
      return;
    }

    const apiKeyHeader = request.headers['x-api-key'];
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : undefined;

    const token = (typeof apiKeyHeader === 'string' ? apiKeyHeader : undefined) ?? bearerToken;

    if (!token || token !== daemonApiKey) {
      reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }
  });
  observability.register(server);

  // Enable CORS with restricted origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
  ];

  await server.register(cors, {
    origin: (origin, callback) => {
      // TODO: Security - For production, implement proper authentication (API keys, mTLS)
      // instead of allowing no-origin requests. Currently allows for development convenience.

      // Allow requests with no origin ONLY in development
      if (!origin) {
        // Check NODE_ENV to determine environment
        const isDevelopment = process.env.NODE_ENV !== 'production';
        if (isDevelopment) {
          // Development: allow no-origin (curl, Postman, server-to-server)
          callback(null, true);
          return;
        }
        // Production: reject no-origin requests (enforce proper auth instead)
        callback(new Error('Origin header required in production'), false);
        return;
      }

      // Check if origin is in whitelist
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
  });

  // Register REST API routes
    registerJobsAPI({
      server,
      hostService,
      logger,
      observability,
    });

    registerCronAPI({
      server,
      hostService,
      logger,
      observability,
    });

  if (workflowService) {
    registerWorkflowsAPI({
      server,
      hostService,
      engine,
      workflowService,
      logger,
      observability,
    });
  }

  // Approvals API (always enabled — needed for builtin:approval steps)
  registerApprovalsAPI({
    server,
    engine,
    logger,
    observability,
  });

  // Stats API — dashboard statistics
  registerStatsAPI({
    server,
    hostService,
    cronScheduler,
    logger,
  });

  // Health check
  server.get('/health', async () => {
    const metrics = await hostService.getMetrics();
    const checks = buildWorkflowChecks({ workflowService, cronScheduler, metrics });
    return {
      status: checks.some((entry) => entry.status === 'error') ? 'degraded' : 'ok',
      service: 'workflow',
      ts: Date.now(),
    };
  });

  server.get('/ready', async () => {
    const metrics = await hostService.getMetrics();
    const checks = buildWorkflowChecks({ workflowService, cronScheduler, metrics });
    const hasErrors = checks.some((entry) => entry.status === 'error');
    const hasWarnings = checks.some((entry) => entry.status === 'warn');
    return createServiceReadyResponse({
      ready: !hasErrors,
      status: hasErrors ? 'initializing' : hasWarnings ? 'degraded' : 'ready',
      reason: hasErrors ? 'workflow_checks_failed' : 'ready',
      components: {
        workflowEngine: {
          ready: true,
        },
        workflowCatalog: {
          ready: Boolean(workflowService),
        },
        cronScheduler: {
          ready: Boolean(cronScheduler),
        },
      },
    });
  });

  // Metrics
  server.get('/metrics', async (_request, reply) => {
    const metrics = await hostService.getMetrics();
    const healthStatus = resolveWorkflowHealthStatus(metrics);
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return observability.renderPrometheusMetrics(
      healthStatus,
      buildWorkflowMetricLines(metrics),
    );
  });
  server.get('/observability/describe', async () => observability.buildDescribe());
  server.get('/observability/health', async () => {
    const metrics = await hostService.getMetrics();
    const checks = buildWorkflowChecks({ workflowService, cronScheduler, metrics });

    return observability.buildHealth({
      status: resolveWorkflowHealthStatus(metrics),
      checks,
      topOperations: buildWorkflowTopOperations(metrics, observability.getTopOperations(3)),
      meta: {
        workflowServiceEnabled: Boolean(workflowService),
        cronSchedulerEnabled: Boolean(cronScheduler),
        cronDiscoveryEnabled: Boolean(cronDiscovery),
        runs: metrics.runs,
        jobs: metrics.jobs,
      },
    });
  });

  return server;
}

type WorkflowMetrics = WorkflowEngineMetrics;

function resolveWorkflowHealthStatus(metrics: WorkflowMetrics): ServiceHealthStatus {
  void metrics;
  return 'healthy';
}

function buildWorkflowChecks(input: {
  workflowService?: WorkflowService;
  cronScheduler?: CronScheduler;
  metrics: WorkflowMetrics;
}): ObservabilityCheck[] {
  return [
    {
      id: 'workflow-engine',
      status: 'ok',
      message: `${input.metrics.runs.total} runs tracked`,
    },
    {
      id: 'workflow-catalog',
      status: input.workflowService ? 'ok' : 'warn',
      message: input.workflowService ? 'Workflow service available' : 'Workflow service not configured',
    },
    {
      id: 'cron-scheduler',
      status: input.cronScheduler ? 'ok' : 'warn',
      message: input.cronScheduler ? 'Cron scheduler available' : 'Cron scheduler not configured',
    },
    {
      id: 'workflow-failures',
      status: input.metrics.runs.failed > 0 || input.metrics.jobs.failed > 0 ? 'warn' : 'ok',
      message:
        input.metrics.runs.failed > 0 || input.metrics.jobs.failed > 0
          ? `${input.metrics.runs.failed} failed runs, ${input.metrics.jobs.failed} failed jobs retained in history`
          : 'No failed workflow runs or jobs in retained history',
    },
  ];
}

function buildWorkflowTopOperations(
  metrics: WorkflowMetrics,
  httpOperations: ServiceOperationSample[],
): ServiceOperationSample[] {
  return [
    ...httpOperations,
    {
      operation: 'workflow.runs',
      count: metrics.runs.total,
      errorCount: metrics.runs.failed + metrics.runs.cancelled + metrics.runs.dlq,
    },
    {
      operation: 'workflow.jobs',
      count: metrics.jobs.total,
      errorCount: metrics.jobs.failed,
    },
  ].slice(0, 5);
}

function buildWorkflowMetricLines(metrics: WorkflowMetrics): string[] {
  return [
    '# HELP workflow_runs_total Total workflow runs grouped by status',
    '# TYPE workflow_runs_total gauge',
    metricLine('workflow_runs_total', metrics.runs.total, { status: 'total' }),
    metricLine('workflow_runs_total', metrics.runs.queued, { status: 'queued' }),
    metricLine('workflow_runs_total', metrics.runs.running, { status: 'running' }),
    metricLine('workflow_runs_total', metrics.runs.completed, { status: 'completed' }),
    metricLine('workflow_runs_total', metrics.runs.failed, { status: 'failed' }),
    metricLine('workflow_runs_total', metrics.runs.cancelled, { status: 'cancelled' }),
    metricLine('workflow_runs_total', metrics.runs.dlq, { status: 'dlq' }),
    '# HELP workflow_jobs_total Total workflow jobs grouped by status',
    '# TYPE workflow_jobs_total gauge',
    metricLine('workflow_jobs_total', metrics.jobs.total, { status: 'total' }),
    metricLine('workflow_jobs_total', metrics.jobs.queued, { status: 'queued' }),
    metricLine('workflow_jobs_total', metrics.jobs.running, { status: 'running' }),
    metricLine('workflow_jobs_total', metrics.jobs.completed, { status: 'completed' }),
    metricLine('workflow_jobs_total', metrics.jobs.failed, { status: 'failed' }),
    metricLine('service_operation_total', metrics.runs.total, { operation: 'workflow.runs', status: 'ok' }),
    metricLine('service_operation_total', metrics.runs.failed + metrics.runs.cancelled + metrics.runs.dlq, { operation: 'workflow.runs', status: 'error' }),
    metricLine('service_operation_total', metrics.jobs.total, { operation: 'workflow.jobs', status: 'ok' }),
    metricLine('service_operation_total', metrics.jobs.failed, { operation: 'workflow.jobs', status: 'error' }),
  ];
}
