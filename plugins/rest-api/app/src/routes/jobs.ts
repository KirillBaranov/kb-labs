/**
 * @module @kb-labs/rest-api-app/routes/jobs
 * Scheduled jobs management endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { ICronManager } from '@kb-labs/core-platform';
import { z } from 'zod';
import {
  ListJobsQuerySchema,
  JobsListResponseSchema,
  JobResponseSchema,
  JobStatsResponseSchema,
  JobActionResponseSchema,
  ErrorResponseSchema,
} from '@kb-labs/rest-api-contracts';
import { normalizeBasePath } from '../utils/path-helpers';

// ============================================================================
// Helper Functions
// ============================================================================

function createError(statusCode: number, code: string, message: string) {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  (error as any).code = code;
  return error;
}

function getJobId(params: unknown): string {
  const id = (params as { id?: unknown } | undefined)?.id;
  if (!id || typeof id !== 'string') {
    throw createError(400, 'JOB_ID_REQUIRED', 'Job id must be provided');
  }
  return id;
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerJobsRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  cronManager: ICronManager | null,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  // Encapsulate Zod compilers so they don't leak to other scopes (plugin routes use plain JSON schemas)
  await server.register(async (scope) => {
    scope.setValidatorCompiler(validatorCompiler);
    scope.setSerializerCompiler(serializerCompiler);
    const s = scope.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /api/v1/jobs
   * List all scheduled jobs
   */
  s.route({
    method: 'GET',
    url: `${basePath}/jobs`,
    schema: {
      tags: ['Jobs'],
      summary: 'List scheduled jobs',
      querystring: ListJobsQuerySchema,
      response: {
        200: JobsListResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      let jobs = cronManager.list();

      const query = request.query as { status?: string };
      if (query.status) {
        jobs = jobs.filter((job) => job.status === query.status);
      }

      return reply.send({ jobs: jobs as any });
    },
  });

  /**
   * GET /api/v1/jobs/stats
   * Get cron jobs statistics (must be before /:id to avoid route conflict)
   */
  s.route({
    method: 'GET',
    url: `${basePath}/jobs/stats`,
    schema: {
      tags: ['Jobs'],
      summary: 'Get cron jobs statistics',
      response: {
        200: JobStatsResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobs = cronManager.list();
      return reply.send({ stats: { total: jobs.length, jobs: jobs as any } });
    },
  });

  /**
   * GET /api/v1/jobs/:id
   * Get job details
   */
  s.route({
    method: 'GET',
    url: `${basePath}/jobs/:id`,
    schema: {
      tags: ['Jobs'],
      summary: 'Get job details',
      params: z.object({ id: z.string() }),
      response: {
        200: JobResponseSchema,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = (request.params as { id: string }).id;
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);

      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      return reply.send({ job: job as any });
    },
  });

  /**
   * POST /api/v1/jobs/:id/trigger
   * Trigger job execution immediately
   */
  s.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/trigger`,
    schema: {
      tags: ['Jobs'],
      summary: 'Trigger job execution immediately',
      params: z.object({ id: z.string() }),
      response: {
        200: JobActionResponseSchema,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = (request.params as { id: string }).id;

      try {
        await cronManager.trigger(jobId);
        return reply.send({ success: true as const, message: `Job ${jobId} triggered successfully` });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
        }
        throw error;
      }
    },
  });

  /**
   * POST /api/v1/jobs/:id/pause
   * Pause job execution
   */
  s.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/pause`,
    schema: {
      tags: ['Jobs'],
      summary: 'Pause job execution',
      params: z.object({ id: z.string() }),
      response: {
        200: JobActionResponseSchema,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = (request.params as { id: string }).id;
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      cronManager.pause(jobId);
      return reply.send({ success: true as const, message: `Job ${jobId} paused successfully` });
    },
  });

  /**
   * POST /api/v1/jobs/:id/resume
   * Resume paused job
   */
  s.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/resume`,
    schema: {
      tags: ['Jobs'],
      summary: 'Resume paused job',
      params: z.object({ id: z.string() }),
      response: {
        200: JobActionResponseSchema,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = (request.params as { id: string }).id;
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      cronManager.resume(jobId);
      return reply.send({ success: true as const, message: `Job ${jobId} resumed successfully` });
    },
  });

  }); // end encapsulated scope
}
