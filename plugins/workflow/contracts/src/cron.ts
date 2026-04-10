import { z } from 'zod'
import { JOB_PRIORITIES } from '@kb-labs/workflow-constants'

type NonEmptyTuple<T> = [T, ...T[]]
const JOB_PRIORITY_VALUES = JOB_PRIORITIES as unknown as NonEmptyTuple<'high' | 'normal' | 'low'>

/**
 * Cron schedule expression (standard cron format)
 * Examples:
 * - "0 * * * *"      - every hour
 * - "0 0 * * *"      - daily at midnight
 * - "0/15 * * * *"   - every 15 minutes
 */
export const CronScheduleSchema = z
  .string()
  .regex(
    /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|[0-6]|\*\/[0-6])$/,
    'Invalid cron expression'
  )
  .describe('Cron schedule expression')

/**
 * Plugin manifest cron job definition
 * Used in plugin manifest.ts to declare scheduled jobs
 */
export const PluginCronJobSchema = z.object({
  id: z.string().min(1).max(64).describe('Unique cron job identifier'),
  schedule: CronScheduleSchema,
  handler: z.string().min(1).describe('Plugin handler (e.g., "mind:rag-index")'),
  input: z.record(z.string(), z.unknown()).optional().describe('Input parameters for handler'),
  priority: z.enum(JOB_PRIORITY_VALUES).default('normal'),
  enabled: z.boolean().default(true).describe('Whether cron job is enabled'),
  timezone: z.string().optional().describe('Timezone for schedule (default: UTC)'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata'),
})

export type PluginCronJob = z.infer<typeof PluginCronJobSchema>

/**
 * User-defined cron job from .kb/jobs/*.yml
 * Full workflow spec with cron trigger
 */
export const UserCronJobSchema = z.object({
  name: z.string().min(1).describe('Human-readable job name'),
  schedule: CronScheduleSchema,
  autoStart: z.boolean().default(true).describe('Auto-start on daemon boot'),
  priority: z.enum(JOB_PRIORITY_VALUES).default('normal'),
  enabled: z.boolean().default(true).describe('Whether cron job is enabled'),
  timezone: z.string().optional().describe('Timezone for schedule (default: UTC)'),
  env: z.record(z.string(), z.string()).optional().describe('Environment variables'),
  jobs: z.record(z.string(), z.any()).describe('Workflow jobs specification'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata'),
})

export type UserCronJob = z.infer<typeof UserCronJobSchema>

/**
 * Registered cron job (internal representation)
 * Combines plugin and user cron jobs
 */
export interface RegisteredCronJob {
  id: string
  source: 'plugin' | 'user'
  schedule: string
  timezone?: string
  priority: 'high' | 'normal' | 'low'
  enabled: boolean

  // For plugin cron jobs
  handler?: string
  input?: Record<string, unknown>

  // For user cron jobs
  workflowSpec?: {
    name: string
    jobs: Record<string, any>
    env?: Record<string, string>
  }

  metadata?: Record<string, unknown>
}

/**
 * Cron job execution history entry
 */
export const CronExecutionSchema = z.object({
  cronJobId: z.string(),
  runId: z.string().describe('Workflow run ID'),
  scheduledAt: z.string().datetime().describe('When execution was scheduled'),
  startedAt: z.string().datetime().optional().describe('When execution started'),
  finishedAt: z.string().datetime().optional().describe('When execution finished'),
  status: z.enum(['pending', 'running', 'success', 'failed']),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
})

export type CronExecution = z.infer<typeof CronExecutionSchema>
