/**
 * Job definition helpers
 * @module @kb-labs/shared-command-kit/jobs
 */

import type { JobDecl, PermissionSpec, PluginContextV3 } from '@kb-labs/plugin-contracts';

/**
 * Job input passed to handler at runtime
 */
export interface JobInput {
  /** Job identifier */
  jobId: string;
  /** When the job was scheduled to execute */
  executedAt: Date;
  /** How many times this job has run */
  runCount: number;
}

/**
 * Job handler function signature
 *
 * @template TInput - Custom input type (extends JobInput)
 * @template TOutput - Handler return type
 */
export type JobHandler<
  TInput extends JobInput = JobInput,
  TOutput = { ok: boolean; [key: string]: unknown }
> = (input: TInput, ctx: PluginContextV3) => Promise<TOutput>;

/**
 * Job definition configuration
 *
 * Combines JobDecl manifest fields with the actual handler function
 * for type-safe job creation.
 */
export interface JobDefinition<
  TInput extends JobInput = JobInput,
  TOutput = { ok: boolean; [key: string]: unknown }
> {
  /** Unique job identifier within plugin (e.g., 'auto-index') */
  id: string;

  /**
   * Cron schedule expression
   * Supports shortcuts (@hourly, @daily, @weekly, @monthly, @yearly) and standard cron format
   */
  schedule: string;

  /** Human-readable description */
  describe?: string;

  /** Whether job is enabled (default: true) */
  enabled?: boolean;

  /** Job priority (1-10, default: 5, higher = more important) */
  priority?: number;

  /** Execution timeout in milliseconds (default: 60000 = 1min) */
  timeout?: number;

  /** Number of retry attempts on failure (default: 2) */
  retries?: number;

  /** Tags for filtering and organization */
  tags?: string[];

  /** Permissions for job execution (filesystem, network, quotas) */
  permissions?: PermissionSpec;

  /** Job handler function */
  handler: JobHandler<TInput, TOutput>;
}

/**
 * Defined job object with manifest conversion
 */
export interface DefinedJob<
  TInput extends JobInput = JobInput,
  TOutput = { ok: boolean; [key: string]: unknown }
> {
  /** Job configuration */
  readonly config: Omit<JobDefinition<TInput, TOutput>, 'handler'> & { handler: string };

  /** Job handler function */
  readonly handler: JobHandler<TInput, TOutput>;

  /** Convert to manifest JobDecl */
  toManifest(handlerPath: string): JobDecl;
}

/**
 * Define a type-safe job with handler
 *
 * This helper provides compile-time type safety for job definitions
 * and allows sharing the same handler function between manifest and runtime.
 *
 * The handler function can be exported from a separate file and the manifest
 * references it via the handler path.
 *
 * See plugin-template/src/jobs/hello.ts for a complete example.
 *
 * @param definition - Job configuration with handler
 * @returns DefinedJob object with handler and manifest conversion
 */
export function defineJob<
  TInput extends JobInput = JobInput,
  TOutput = { ok: boolean; [key: string]: unknown }
>(
  definition: JobDefinition<TInput, TOutput>
): DefinedJob<TInput, TOutput> {
  const { handler, ...config } = definition;

  return {
    config: { ...config, handler: '' }, // handler path will be set in toManifest()
    handler,
    toManifest(handlerPath: string): JobDecl {
      // JobDecl now extends CronDecl, which has job.type instead of handler
      return {
        id: config.id,
        schedule: config.schedule,
        job: {
          type: config.id, // Use job id as type
          payload: {}, // Empty payload by default
        },
        describe: config.describe,
        enabled: config.enabled,
        permissions: definition.permissions,
      };
    },
  };
}
