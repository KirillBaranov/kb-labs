/**
 * Workflow Management API endpoints
 * Provides CRUD operations and schedule management for workflows
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import type { IWorkflowEngine, ICronManager } from '@kb-labs/core-platform';
import {
  WorkflowService,
  WorkflowScheduleManager,
  type WorkflowExecutor,
} from '@kb-labs/workflow-engine';
import { z } from 'zod';
import {
  ListWorkflowsQuerySchema,
  WorkflowsListResponseSchema,
  WorkflowResponseSchema,
  CreateWorkflowBodySchema,
  UpdateWorkflowBodySchema,
  ScheduleConfigBodySchema,
  ValidateWorkflowBodySchema,
  HandlersListResponseSchema,
  ErrorResponseSchema,
} from '@kb-labs/rest-api-contracts';
import { normalizeBasePath } from '../utils/path-helpers';

// ============================================================================
// Helper Functions
// ============================================================================

function errPayload(code: string, message: string) {
  return { ok: false as const, message, error: { code, message } };
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerWorkflowManagementRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  registry: IEntityRegistry,
  platform: PlatformServices,
  workflowEngine: IWorkflowEngine | null,
  cronManager: ICronManager | null,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  // Encapsulate Zod compilers so they don't leak to plugin routes (plain JSON schemas)
  await server.register(async (scope) => {
    scope.setValidatorCompiler(validatorCompiler);
    scope.setSerializerCompiler(serializerCompiler);
    const s = scope.withTypeProvider<ZodTypeProvider>();

  // Initialize services
  const workflowService = new WorkflowService({
    cliApi: registry,
    platform,
    workflowStorageDir: '.kb/workflows',
  });

  // Initialize WorkflowScheduleManager to register jobs from manifests
  if (cronManager && workflowEngine) {
    const executor: WorkflowExecutor = {
      async execute(request) {
        const run = await workflowEngine.execute(
          request.workflowId,
          request.input ?? {},
          {
            tags: { trigger: request.trigger },
          }
        );
        return { runId: run.id };
      },
    };

    const scheduleManager = new WorkflowScheduleManager({
      cronManager,
      workflowService,
      executor,
      platform,
    });

    // Register all scheduled workflows/jobs from manifests
    await scheduleManager.registerAll();

    platform.logger?.info('WorkflowScheduleManager initialized and jobs registered');
  } else {
    platform.logger?.warn('WorkflowScheduleManager not initialized: cronManager or workflowEngine unavailable');
  }

  // ========================================================================
  // Workflow CRUD
  // ========================================================================

  /**
   * GET /api/v1/workflows
   * List all workflows (manifest + standalone)
   */
  s.route({
    method: 'GET',
    url: `${basePath}/workflows`,
    schema: {
      tags: ['Workflows'],
      summary: 'List all workflows',
      querystring: ListWorkflowsQuerySchema,
      response: {
        200: WorkflowsListResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const query = request.query;

      const workflows = await workflowService.listAll({
        source: query.source,
        status: query.status,
      });

      let filtered = workflows;

      if (query.tags) {
        const tags = query.tags.split(',').map((t) => t.trim());
        filtered = filtered.filter((w) => (w as any).tags?.some((tag: string) => tags.includes(tag)));
      }

      if (query.search) {
        const search = query.search.toLowerCase();
        filtered = filtered.filter(
          (w) =>
            (w as any).name?.toLowerCase().includes(search) ||
            (w as any).description?.toLowerCase().includes(search)
        );
      }

      reply.send({ workflows: filtered as any, total: filtered.length });
    },
  });

  /**
   * GET /api/v1/workflows/handlers
   * List available workflow handlers (must be before /:id to avoid route conflict)
   */
  s.route({
    method: 'GET',
    url: `${basePath}/workflows/handlers`,
    schema: {
      tags: ['Workflows'],
      summary: 'List available workflow handlers',
      response: {
        200: HandlersListResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const handlers = await workflowService.getAvailableHandlers();
      reply.send({ handlers: handlers as any, total: handlers.length });
    },
  });

  /**
   * POST /api/v1/workflows/validate
   * Validate workflow spec (must be before /:id to avoid route conflict)
   */
  s.route({
    method: 'POST',
    url: `${basePath}/workflows/validate`,
    schema: {
      tags: ['Workflows'],
      summary: 'Validate workflow spec',
      body: ValidateWorkflowBodySchema,
      response: {
        200: z.record(z.string(), z.unknown()),
      },
    },
    handler: async (request, reply) => {
      const result = await workflowService.validate(request.body.spec);
      reply.send(result as any);
    },
  });

  /**
   * GET /api/v1/workflows/:id
   * Get workflow by ID
   */
  s.route({
    method: 'GET',
    url: `${basePath}/workflows/:id`,
    schema: {
      tags: ['Workflows'],
      summary: 'Get workflow by ID',
      params: z.object({ id: z.string() }),
      response: {
        200: WorkflowResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const workflow = await workflowService.get(request.params.id);

      if (!workflow) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${request.params.id} not found`) as any);
      }

      reply.send({ workflow } as any);
    },
  });

  /**
   * POST /api/v1/workflows
   * Create new standalone workflow
   */
  s.route({
    method: 'POST',
    url: `${basePath}/workflows`,
    schema: {
      tags: ['Workflows'],
      summary: 'Create standalone workflow',
      body: CreateWorkflowBodySchema,
      response: {
        201: WorkflowResponseSchema,
        400: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const workflow = await workflowService.create(request.body.spec as any);
      reply.code(201).send({ workflow } as any);
    },
  });

  /**
   * PUT /api/v1/workflows/:id
   * Update standalone workflow
   */
  s.route({
    method: 'PUT',
    url: `${basePath}/workflows/:id`,
    schema: {
      tags: ['Workflows'],
      summary: 'Update standalone workflow',
      params: z.object({ id: z.string() }),
      body: UpdateWorkflowBodySchema,
      response: {
        200: WorkflowResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot update manifest-based workflow ${id}`) as any);
      }

      if (request.body.spec) {
        await workflowService.update(id, request.body.spec);
      }

      if (request.body.status) {
        if (request.body.status === 'paused') {
          await workflowService.pause(id);
        } else if (request.body.status === 'active') {
          await workflowService.resume(id);
        } else if (request.body.status === 'disabled') {
          await workflowService.disable(id);
        }
      }

      const workflow = await workflowService.get(id);
      reply.send({ workflow } as any);
    },
  });

  /**
   * DELETE /api/v1/workflows/:id
   * Delete standalone workflow
   */
  s.route({
    method: 'DELETE',
    url: `${basePath}/workflows/:id`,
    schema: {
      tags: ['Workflows'],
      summary: 'Delete standalone workflow',
      params: z.object({ id: z.string() }),
      response: {
        204: z.null(),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot delete manifest-based workflow ${id}`) as any);
      }

      await workflowService.delete(id);
      reply.code(204).send(null);
    },
  });

  // ========================================================================
  // Schedule Management
  // ========================================================================

  /**
   * POST /api/v1/workflows/:id/schedule
   * Enable or update workflow schedule
   */
  s.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/schedule`,
    schema: {
      tags: ['Workflows'],
      summary: 'Enable or update workflow schedule',
      params: z.object({ id: z.string() }),
      body: ScheduleConfigBodySchema,
      response: {
        200: WorkflowResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;
      const scheduleConfig = request.body;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot modify schedule for manifest-based workflow ${id}`) as any);
      }

      const workflow = await workflowService.update(id, {
        on: {
          schedule: scheduleConfig.enabled
            ? { cron: scheduleConfig.cron, timezone: scheduleConfig.timezone }
            : undefined,
        },
      });

      reply.send({ workflow } as any);
    },
  });

  /**
   * DELETE /api/v1/workflows/:id/schedule
   * Disable workflow schedule
   */
  s.route({
    method: 'DELETE',
    url: `${basePath}/workflows/:id/schedule`,
    schema: {
      tags: ['Workflows'],
      summary: 'Disable workflow schedule',
      params: z.object({ id: z.string() }),
      response: {
        200: WorkflowResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot modify schedule for manifest-based workflow ${id}`) as any);
      }

      const workflow = await workflowService.update(id, { on: { schedule: undefined } });
      reply.send({ workflow } as any);
    },
  });

  /**
   * POST /api/v1/workflows/:id/pause
   * Pause workflow (disable schedule temporarily)
   */
  s.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/pause`,
    schema: {
      tags: ['Workflows'],
      summary: 'Pause workflow (disable schedule temporarily)',
      params: z.object({ id: z.string() }),
      response: {
        200: WorkflowResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot pause manifest-based workflow ${id}`) as any);
      }

      await workflowService.pause(id);
      const workflow = await workflowService.get(id);
      reply.send({ workflow } as any);
    },
  });

  /**
   * POST /api/v1/workflows/:id/resume
   * Resume workflow (re-enable schedule)
   */
  s.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/resume`,
    schema: {
      tags: ['Workflows'],
      summary: 'Resume workflow (re-enable schedule)',
      params: z.object({ id: z.string() }),
      response: {
        200: WorkflowResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const id = request.params.id;

      const existing = await workflowService.get(id);
      if (!existing) {
        return reply.code(404).send(errPayload('WF_NOT_FOUND', `Workflow ${id} not found`) as any);
      }

      if ((existing as any).source !== 'standalone') {
        return reply.code(400).send(errPayload('WF_NOT_STANDALONE', `Cannot resume manifest-based workflow ${id}`) as any);
      }

      await workflowService.resume(id);
      const workflow = await workflowService.get(id);
      reply.send({ workflow } as any);
    },
  });

  }); // end encapsulated scope
}
