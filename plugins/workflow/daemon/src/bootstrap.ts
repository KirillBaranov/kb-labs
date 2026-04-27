/**
 * @module @kb-labs/workflow-daemon/bootstrap
 * Bootstrap workflow daemon - initialize platform, engine, worker, and HTTP server
 */

import { platform, createServiceBootstrap } from '@kb-labs/core-runtime';
import { WorkflowEngine, WorkflowService } from '@kb-labs/workflow-engine';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import { createWorkflowWorker } from './worker.js';
import { JobBroker } from './job-broker.js';
import { CronScheduler } from './cron-scheduler.js';
import { CronDiscovery } from './cron-discovery.js';
import { createServer } from './server.js';
import { createRegistry } from '@kb-labs/core-registry';
import { findRepoRoot } from '@kb-labs/core-sys';
import { randomUUID } from 'node:crypto';
import type { WorkflowWorker } from './worker.js';
import type { FastifyInstance } from 'fastify';

// Singleton instances for cleanup
let workerInstance: WorkflowWorker | null = null;
let serverInstance: FastifyInstance | null = null;
let cronSchedulerInstance: CronScheduler | null = null;

/**
 * Bootstrap workflow daemon.
 * Initializes platform, engine, worker, and HTTP server.
 */
export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  // Detect repo root first
  const repoRoot = await findRepoRoot(cwd);

  // Project root: where the user's project lives (.kb/workflows, workflow YAMLs).
  // KB_PROJECT_ROOT is injected by kb-dev when invoked from a project directory
  // that points to a separate platform via kb.config.jsonc → platform.dir.
  const projectRoot = process.env['KB_PROJECT_ROOT'] ?? repoRoot;

  // Initialize platform (loads .env + adapters from kb.config.json)
  await createServiceBootstrap({ appId: 'workflow-daemon', repoRoot });

  if (!platform.isConfigured('workspace')) {
    // Not fatal — workflows with explicit isolation: relaxed will still work.
    // But balanced (default) and strict isolation will fail at job execution time.
    process.stderr.write(
      '[workflow-daemon] WARNING: workspace adapter is not configured.\n' +
      '[workflow-daemon] Workflows that use isolation: balanced (default) or isolation: strict will fail.\n' +
      '[workflow-daemon] To fix: set platform.adapters.workspace in kb.config.json.\n' +
      '[workflow-daemon] To run without a workspace: add "isolation: relaxed" to your workflow YAML.\n',
    );
  }

  if (!platform.isConfigured('environment') && platform.isConfigured('workspace')) {
    process.stderr.write(
      '[workflow-daemon] WARNING: environment adapter is not configured.\n' +
      '[workflow-daemon] Workflows that use isolation: strict will fail.\n' +
      '[workflow-daemon] To fix: set platform.adapters.environment in kb.config.json.\n',
    );
  }

  // Now we can use platform.logger (configured from kb.config.json)
  const startupRequestId = `workflow-startup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startupTraceId = randomUUID();
  const startupSpanId = randomUUID();
  const bootstrapLogger = createCorrelatedLogger(platform.logger, {
    serviceId: 'workflow',
    logsSource: 'workflow',
    layer: 'workflow',
    service: 'bootstrap',
    requestId: startupRequestId,
    traceId: startupTraceId,
    operation: 'workflow.bootstrap',
    bindings: {
      spanId: startupSpanId,
      invocationId: startupSpanId,
      executionId: startupSpanId,
    },
  });

  const debugMode = process.env['WORKFLOW_DEBUG'] === 'true';
  bootstrapLogger.info('Workflow daemon starting', { repoRoot, projectRoot, debugMode });

  if (debugMode) {
    bootstrapLogger.warn(
      '[WORKFLOW_DEBUG=true] Verbose debug logging is ON — step inputs, outputs, and expr contexts will be logged. ' +
      'Disable in production (unset WORKFLOW_DEBUG or set to false).',
    );
  }

  const createWorkflowLogger = (service: string, operation: string, bindings?: Record<string, unknown>) =>
    createCorrelatedLogger(platform.logger, {
      serviceId: 'workflow',
      logsSource: 'workflow',
      layer: 'workflow',
      service,
      operation,
      bindings,
    });

  // Initialize CLI API consumer snapshot
  bootstrapLogger.info('Loading plugin registry snapshot');

  const cliApi = await createRegistry({
    root: repoRoot,
    cache: {
      ttlMs: 10 * 60 * 1000, // 10 minutes
    },
  });

  await cliApi.initialize();
  const plugins = await cliApi.listPlugins();
  bootstrapLogger.info('Plugin registry snapshot loaded', {
    pluginsFound: plugins.length,
    pluginIds: plugins.map(p => `${p.id}@${p.version}`),
  });

  bootstrapLogger.info('Creating WorkflowEngine');
  const engine = new WorkflowEngine({
    cache: platform.cache,
    events: platform.eventBus,
    logger: createWorkflowLogger('engine', 'workflow.engine'),
    snapshotManager: (platform as Record<string, unknown>).snapshotManager as never,
    workspaceRoot: projectRoot,
  });

  // Mark stale running/queued runs as failed (they're orphaned from previous process)
  bootstrapLogger.info('Cleaning up stale runs from previous daemon process');
  await engine.cleanupStaleRuns();

  // Resume interrupted jobs from previous shutdown
  bootstrapLogger.info('Resuming interrupted jobs');
  await engine.resumeInterruptedJobs();

  // Create JobBroker
  bootstrapLogger.info('Creating JobBroker');
  const jobBroker = new JobBroker(engine, createWorkflowLogger('job-broker', 'workflow.job-broker'), platform);

  // Create CronScheduler (before HTTP server so it can be exposed via API)
  bootstrapLogger.info('Creating CronScheduler');
  const cronScheduler = new CronScheduler({
    jobBroker,
    workflowEngine: engine,
    logger: createWorkflowLogger('cron-scheduler', 'workflow.cron-scheduler'),
    timezone: process.env.WORKFLOW_CRON_TIMEZONE,
  });

  // Store cron scheduler instance for cleanup
  cronSchedulerInstance = cronScheduler;

  // Discover cron jobs from plugin manifests and user YAML files (BEFORE HTTP server)
  bootstrapLogger.info('Discovering cron jobs');
  const cronDiscovery = new CronDiscovery({
    cliApi,
    scheduler: cronScheduler,
    logger: createWorkflowLogger('cron-discovery', 'workflow.cron-discovery'),
    workspaceRoot: projectRoot,
  });

  const discovered = await cronDiscovery.discoverAll();
  bootstrapLogger.info('Cron job discovery complete', discovered);

  // Create WorkflowService for workflow definitions management
  bootstrapLogger.info('Creating WorkflowService');
  const workflowService = new WorkflowService({
    cliApi,
    platform,
    workspaceRoot: projectRoot,
  });

  // Create HTTP API server (pass cronDiscovery for refresh endpoint)
  bootstrapLogger.info('Creating HTTP server');
  const server = await createServer({
    engine,
    jobBroker,
    workflowService,
    cronScheduler,
    cronDiscovery,
    logger: createWorkflowLogger('api', 'workflow.api'),
  });

  // Start HTTP server
  const port = parseInt(process.env.WORKFLOW_PORT || '7778', 10);
  // Internal service — bind to loopback only. All public traffic goes through the gateway.
  await server.listen({ port, host: process.env.WORKFLOW_HOST ?? '127.0.0.1' });
  bootstrapLogger.info('HTTP API listening', { port });

  // Store server instance for cleanup
  serverInstance = server;

  // Create WorkflowWorker
  bootstrapLogger.info('Creating WorkflowWorker');
  const worker = await createWorkflowWorker({
    engine,
    cliApi,
    logger: createWorkflowLogger('worker', 'workflow.worker'),
    analytics: platform.analytics,
    platform,
    workspaceRoot: projectRoot,
    concurrency: parseInt(process.env.WORKFLOW_CONCURRENCY || '5', 10),
    debugMode,
  });

  // Store worker instance for cleanup
  workerInstance = worker;

  // Start worker
  bootstrapLogger.info('Starting WorkflowWorker');
  // Start worker in background (non-blocking)
  worker.start().catch(error => {
    bootstrapLogger.error('Worker crashed - shutting down daemon', error instanceof Error ? error : undefined);
    // Trigger graceful shutdown - daemon cannot function without worker
    process.kill(process.pid, 'SIGTERM');
  });

  // Start cron scheduler
  if (discovered.plugins + discovered.users > 0) {
    bootstrapLogger.info('Starting CronScheduler');
    await cronScheduler.start();
  } else {
    bootstrapLogger.info('No cron jobs found, skipping CronScheduler start');
  }

  bootstrapLogger.info('Workflow daemon started successfully', { port });

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    bootstrapLogger.warn('Received shutdown signal', { signal });

    // Stop cron scheduler first (prevent new jobs from being scheduled)
    if (cronSchedulerInstance) {
      await cronSchedulerInstance.stop();
      cronSchedulerInstance = null;
    }

    // Stop worker (wait for in-flight jobs)
    if (workerInstance) {
      await workerInstance.stop();
      workerInstance = null;
    }

    // Close HTTP server
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }

    // Dispose CLI API
    await cliApi.dispose();

    // Shutdown platform (includes ExecutionBackend and all adapters)
    await platform.shutdown();
    bootstrapLogger.info('Workflow daemon shutdown complete');

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
