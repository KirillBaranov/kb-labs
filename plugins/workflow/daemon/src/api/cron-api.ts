/**
 * @module @kb-labs/workflow-daemon/api/cron
 * Cron REST API routes
 */

import type { FastifyInstance } from 'fastify';
import type { ILogger } from '@kb-labs/core-platform';
import type { OperationObserver } from '@kb-labs/shared-http';
import type { CronRegistrationRequest } from '@kb-labs/workflow-contracts';
import type { WorkflowHostService } from '../host/workflow-host-service.js';
import { fail, ok } from './response.js';

interface CronIdParams {
  id: string;
}

export interface CronAPIOptions {
  server: FastifyInstance;
  hostService: WorkflowHostService;
  logger: ILogger;
  observability: OperationObserver;
}

/**
 * Register Cron API routes
 */
export function registerCronAPI(options: CronAPIOptions): void {
  const { server, hostService, logger, observability } = options;

  server.post<{ Body: CronRegistrationRequest }>(
    '/api/v1/crons',
    { schema: { tags: ['Cron'], summary: 'Register a cron job' } },
    async (request, reply) => {
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'default';
      try {
        const data = await observability.observeOperation('workflow.cron.register', () =>
          Promise.resolve(hostService.registerCron(tenantId, request.body)),
        );
        return ok(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to register cron job';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        if (message.startsWith('Missing required fields')) {
          return fail(reply, 400, message);
        }
        logger.error('Failed to register cron job', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );

  server.get(
    '/api/v1/crons',
    { schema: { tags: ['Cron'], summary: 'List cron jobs' } },
    async (_request, reply) => {
      try {
        return ok(await observability.observeOperation('workflow.cron.list', () => Promise.resolve(hostService.listCron())));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list cron jobs';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        logger.error('Failed to list cron jobs', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );

  server.delete<{ Params: CronIdParams }>(
    '/api/v1/crons/:id',
    { schema: { tags: ['Cron'], summary: 'Unregister a cron job' } },
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'default';
      try {
        const data = await observability.observeOperation('workflow.cron.unregister', () =>
          Promise.resolve(hostService.unregisterCron(tenantId, id)),
        );
        return ok(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to unregister cron job';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        logger.error('Failed to unregister cron job', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );

  server.post<{ Params: CronIdParams }>(
    '/api/v1/crons/:id/trigger',
    { schema: { tags: ['Cron'], summary: 'Trigger a cron job immediately' } },
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'default';
      try {
        const data = await observability.observeOperation('workflow.cron.trigger', () => hostService.triggerCron(tenantId, id));
        return ok(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to trigger cron job';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        logger.error('Failed to trigger cron job', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );

  server.post<{ Params: CronIdParams }>(
    '/api/v1/crons/:id/pause',
    { schema: { tags: ['Cron'], summary: 'Pause a cron job' } },
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'default';
      try {
        const data = await observability.observeOperation('workflow.cron.pause', () =>
          Promise.resolve(hostService.pauseCron(tenantId, id)),
        );
        return ok(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to pause cron job';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        logger.error('Failed to pause cron job', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );

  server.post<{ Params: CronIdParams }>(
    '/api/v1/crons/:id/resume',
    { schema: { tags: ['Cron'], summary: 'Resume a cron job' } },
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = (request.headers['x-tenant-id'] as string) ?? 'default';
      try {
        const data = await observability.observeOperation('workflow.cron.resume', () =>
          Promise.resolve(hostService.resumeCron(tenantId, id)),
        );
        return ok(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resume cron job';
        if (message === 'Cron scheduler not available') {
          return fail(reply, 503, message);
        }
        logger.error('Failed to resume cron job', error instanceof Error ? error : undefined);
        return fail(reply, 500, message);
      }
    },
  );
}
