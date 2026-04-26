/**
 * @module @kb-labs/workflow-daemon/api/workflows-api
 * REST API endpoints for managing workflow definitions
 */

import type { FastifyInstance } from 'fastify';
import type { ILogger } from '@kb-labs/core-platform';
import type { WorkflowRunRequest } from '@kb-labs/workflow-contracts';
import type { WorkflowEngine, WorkflowService } from '@kb-labs/workflow-engine';
import type { OperationObserver } from '@kb-labs/shared-http';
import type { WorkflowHostService } from '../host/workflow-host-service.js';
import { fail, ok } from './response.js';

const TERMINAL_EVENTS = ['run.finished', 'run.failed', 'run.cancelled'];
const TERMINAL_STATUSES = ['success', 'failed', 'cancelled', 'skipped', 'dlq'];
const KEEP_ALIVE_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

export interface RegisterWorkflowsAPIOptions {
  server: FastifyInstance;
  hostService: WorkflowHostService;
  engine: WorkflowEngine;
  workflowService?: WorkflowService;
  logger: ILogger;
  observability: OperationObserver;
}

/**
 * Register workflow definition management endpoints.
 *
 * Endpoints:
 * - GET /api/v1/workflows - List all workflow definitions
 * - GET /api/v1/workflows/:id - Get workflow definition details
 * - GET /api/v1/workflows/:id/runs - Get run history for a workflow
 * - POST /api/v1/workflows/:id/run - Run a workflow
 */
export function registerWorkflowsAPI(options: RegisterWorkflowsAPIOptions): void {
  const { server, hostService, engine, workflowService, logger, observability } = options;

  // POST /api/v1/workflows/refresh - Reload workflow definitions from disk
  server.post('/api/v1/workflows/refresh', { schema: { tags: ['Workflows'], summary: 'Reload workflow definitions from disk' } }, async () => {
    try {
      logger.info('[workflows-api] Refreshing workflows from disk');

      if (workflowService) {
        await observability.observeOperation('workflow.catalog.refresh', () => workflowService.refreshManifests());
      }

      const workflows = workflowService
        ? await observability.observeOperation('workflow.catalog.list', () => workflowService.listAll())
        : [];

      return ok({
        workflowsLoaded: workflows.length,
        workflowIds: workflows.map((w) => w.id),
      });
    } catch (error) {
      logger.error('[workflows-api] Failed to refresh workflows', error instanceof Error ? error : undefined);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // GET /api/v1/workflows - List all workflow definitions
  server.get<{
    Querystring: {
      source?: 'manifest' | 'standalone';
      status?: 'active' | 'inactive';
      tags?: string;
    };
  }>('/api/v1/workflows', { schema: { tags: ['Workflows'], summary: 'List workflow definitions' } }, async (request, reply) => {
    try {
      const response = await observability.observeOperation('workflow.catalog.list', () => hostService.listWorkflows(request.query));
      return ok(response);
    } catch (error) {
      logger.error('[workflows-api] Error listing workflows', error instanceof Error ? error : undefined);
      return fail(reply, 500, error instanceof Error ? error.message : 'Failed to list workflows');
    }
  });

  // GET /api/v1/workflows/:id - Get workflow definition details
  server.get<{
    Params: { id: string };
  }>('/api/v1/workflows/:id', { schema: { tags: ['Workflows'], summary: 'Get workflow definition' } }, async (request, reply) => {
    try {
      const { id } = request.params;
      const workflow = await observability.observeOperation('workflow.catalog.get', () => hostService.getWorkflow(id));
      if (!workflow) {
        return fail(reply, 404, 'Workflow not found');
      }
      return ok(workflow);
    } catch (error) {
      logger.error('[workflows-api] Error getting workflow', error instanceof Error ? error : undefined);
      return fail(reply, 500, error instanceof Error ? error.message : 'Failed to get workflow');
    }
  });

  // GET /api/v1/workflows/:id/runs - Get run history for a workflow
  server.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; status?: string };
  }>('/api/v1/workflows/:id/runs', { schema: { tags: ['Workflows'], summary: 'List runs for a workflow' } }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { limit, offset, status } = request.query;
      const response = await observability.observeOperation('workflow.run.list', () =>
        hostService.listWorkflowRuns(id, {
          limit: limit ? parseInt(limit, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0,
          status,
        }),
      );
      return ok(response);
    } catch (error) {
      logger.error('[workflows-api] Error listing workflow runs', error instanceof Error ? error : undefined);
      return fail(reply, 500, error instanceof Error ? error.message : 'Failed to list workflow runs');
    }
  });

  // POST /api/v1/workflows/:id/runs - Run a workflow
  server.post<{
    Params: { id: string };
    Body: WorkflowRunRequest;
  }>('/api/v1/workflows/:id/runs', { schema: { tags: ['Workflows'], summary: 'Run a workflow' } }, async (request, reply) => {
    try {
      const { id } = request.params;
      const response = await observability.observeOperation('workflow.run.start', () => hostService.runWorkflow(id, request.body || {}));
      return ok(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run workflow';
      if (message === 'Workflow not found') {
        return fail(reply, 404, message);
      }
      logger.error('[workflows-api] Error running workflow', error instanceof Error ? error : undefined);
      return fail(reply, 500, message);
    }
  });

  // POST /api/v1/runs/:runId/cancel - Cancel a running workflow run
  server.post<{
    Params: { runId: string };
  }>('/api/v1/runs/:runId/cancel', { schema: { tags: ['Runs'], summary: 'Cancel a workflow run' } }, async (request, reply) => {
    try {
      const { runId } = request.params;
      await observability.observeOperation('workflow.run.cancel', () => hostService.cancelRun(runId));
      return ok({ cancelled: true, runId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel run';
      if (message === 'Run not found') {
        return fail(reply, 404, message);
      }
      if (message.startsWith('Cannot cancel run')) {
        return fail(reply, 409, message);
      }
      logger.error('[workflows-api] Error cancelling run', error instanceof Error ? error : undefined);
      return fail(reply, 500, message);
    }
  });

  // GET /api/v1/runs - List all workflow runs (across all workflows)
  server.get<{
    Querystring: { status?: string; limit?: string; offset?: string };
  }>('/api/v1/runs', { schema: { tags: ['Runs'], summary: 'List all workflow runs' } }, async (request, reply) => {
    try {
      const { status, limit, offset } = request.query;
      const response = await observability.observeOperation('workflow.run.list', () =>
        hostService.listRuns({
          status,
          limit: limit ? parseInt(limit, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0,
        }),
      );
      return ok(response);
    } catch (error) {
      logger.error('[workflows-api] Error listing runs', error instanceof Error ? error : undefined);
      return fail(reply, 500, error instanceof Error ? error.message : 'Failed to list runs');
    }
  });

  // GET /api/v1/runs/:runId - Get a specific workflow run
  server.get<{
    Params: { runId: string };
  }>('/api/v1/runs/:runId', { schema: { tags: ['Runs'], summary: 'Get a workflow run' } }, async (request, reply) => {
    try {
      const { runId } = request.params;
      const run = await observability.observeOperation('workflow.run.get', () => hostService.getRun(runId));
      if (!run) {
        return fail(reply, 404, 'Run not found');
      }
      return ok({ run });
    } catch (error) {
      logger.error('[workflows-api] Error getting run', error instanceof Error ? error : undefined);
      return fail(reply, 500, error instanceof Error ? error.message : 'Failed to get run');
    }
  });

  // GET /api/v1/runs/:runId/events — SSE stream of run events
  // hide: true — SSE uses raw socket hijack, incompatible with OpenAPI response schema
  server.get<{
    Params: { runId: string };
  }>('/api/v1/runs/:runId/events', { schema: { hide: true } }, async (request, reply) => {
    const { runId } = request.params;

    const run = await observability.observeOperation('workflow.run.events', () => engine.getRun(runId));
    if (!run) {
      return fail(reply, 404, 'Run not found');
    }

    // SSE response
    reply.hijack();
    const raw = reply.raw;

    const origin = request.headers.origin;
    if (typeof origin === 'string' && origin.startsWith('http://localhost')) {
      raw.setHeader('Access-Control-Allow-Origin', origin);
      raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.flushHeaders?.();
    raw.write(': connected\n\n');

    const sendEvent = (type: string, payload: unknown) => {
      if (raw.writableEnded) {return;}
      raw.write(`event: workflow.event\n`);
      raw.write(`data: ${JSON.stringify({ type, runId, payload, timestamp: new Date().toISOString() })}\n\n`);
    };

    // Send current snapshot
    sendEvent('run.snapshot', run);

    // If run already terminal — close immediately
    if (TERMINAL_STATUSES.includes(run.status)) {
      raw.end();
      return;
    }

    // Subscribe to live events
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdle = () => {
      if (idleTimer) {clearTimeout(idleTimer);}
      idleTimer = setTimeout(() => {
        cleanup();
      }, IDLE_TIMEOUT_MS);
    };

    const keepAliveTimer = setInterval(() => {
      if (raw.writableEnded) {return;}
      raw.write(': keep-alive\n\n');
    }, KEEP_ALIVE_MS);

    const unsubscribe = engine.subscribeToRunEvents(runId, (event) => {
      sendEvent(event.type, event.payload);
      resetIdle();
      if (TERMINAL_EVENTS.includes(event.type)) {
        cleanup();
      }
    });

    const cleanup = () => {
      unsubscribe();
      if (idleTimer) {clearTimeout(idleTimer);}
      clearInterval(keepAliveTimer);
      if (!raw.writableEnded) {raw.end();}
    };

    resetIdle();
    request.raw.on('close', cleanup);
  });

  logger.info('[workflows-api] Workflows API endpoints registered');
}
