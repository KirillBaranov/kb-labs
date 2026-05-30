/**
 * @module @kb-labs/rest-api-contracts/route-schemas
 * Zod schemas for REST API route-level body/query/response.
 * Used with fastify-type-provider-zod so route schemas are fully typed.
 */

import { z } from 'zod';

// ── Shared ────────────────────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  message: z.string().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const OkResponseSchema = z.object({ ok: z.literal(true) });

const AnyRecord = z.record(z.string(), z.unknown());

// ── Jobs ──────────────────────────────────────────────────────────────────────

export const ListJobsQuerySchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
});

export const JobSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
  schedule: z.string().optional(),
}).passthrough();

export const JobsListResponseSchema = z.object({
  jobs: z.array(JobSchema),
});

export const JobResponseSchema = z.object({
  job: JobSchema,
});

export const JobStatsResponseSchema = z.object({
  stats: z.object({
    total: z.number(),
    jobs: z.array(JobSchema),
  }),
});

export const JobActionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

// ── Workflows ─────────────────────────────────────────────────────────────────

export const ListWorkflowsQuerySchema = z.object({
  source: z.enum(['manifest', 'standalone']).optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  tags: z.string().optional(),
  search: z.string().optional(),
});

export const WorkflowSchema = AnyRecord;

export const WorkflowsListResponseSchema = z.object({
  workflows: z.array(AnyRecord),
  total: z.number(),
});

export const WorkflowResponseSchema = z.object({
  workflow: AnyRecord.nullable(),
});

export const CreateWorkflowBodySchema = z.object({
  spec: AnyRecord,
});

export const UpdateWorkflowBodySchema = z.object({
  spec: z.object({
    name: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    description: z.string().optional(),
    on: z.any().optional(),
    env: z.record(z.string(), z.string()).optional(),
    secrets: z.array(z.string().min(1)).optional(),
    jobs: z.record(z.string().min(1), z.any()).optional(),
  }).optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
});

export const ScheduleConfigBodySchema = z.object({
  cron: z.string().min(1),
  enabled: z.boolean(),
  timezone: z.string().optional(),
});

export const ValidateWorkflowBodySchema = z.object({
  spec: z.any(),
});

export const HandlersListResponseSchema = z.object({
  handlers: z.array(AnyRecord),
  total: z.number(),
});
