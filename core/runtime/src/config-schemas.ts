/**
 * @module @kb-labs/core-runtime/config-schemas
 *
 * Zod schemas for platform config validation.
 * Applied at load time to catch misconfiguration early.
 *
 * Only ExecutionConfig is strictly validated here — it's the most complex
 * config section with security-sensitive values (secrets, URLs, JWT keys).
 * Other sections (adapters, core) use TypeScript types only.
 */

import { z } from 'zod';

// ── ContainerExecutionConfig ──────────────────────────────────────────────────

export const ContainerExecutionConfigSchema = z.object({
  /** URL for the Gateway's internal dispatch endpoint (used by loader.ts RoutingBackend transport). */
  gatewayDispatchUrl: z.string().url({
    message: 'execution.container.gatewayDispatchUrl must be a valid URL (e.g. "http://localhost:4000/internal/dispatch")',
  }),
  /** Internal secret for the dispatch endpoint. */
  gatewayInternalSecret: z.string().min(1, {
    message: 'execution.container.gatewayInternalSecret must not be empty. Use ${ENV_VAR} to reference an environment variable.',
  }),
  // gatewayWsUrl and gatewayJwtSecret moved to adapterOptions.environment.gateway
  // (adapter-owned: DockerEnvironmentAdapter injects them during reserve()+start())
  image: z.string().optional(),
  pullPolicy: z.enum(['Always', 'IfNotPresent', 'Never']).optional(),
  dockerFlags: z.array(z.string()).optional(),
});

// ── ExecutionRetryConfig ──────────────────────────────────────────────────────

export const ExecutionRetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).optional(),
  initialDelayMs: z.number().int().nonnegative().optional(),
  backoffMultiplier: z.number().positive().optional(),
  maxDelayMs: z.number().int().nonnegative().optional(),
  onlyRetryable: z.boolean().optional(),
});

// ── ExecutionConfig ───────────────────────────────────────────────────────────

export const ExecutionConfigSchema = z.object({
  mode: z.enum(['auto', 'in-process', 'subprocess', 'worker-pool', 'remote', 'container']).optional(),

  workerPool: z.object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().positive().optional(),
    maxRequestsPerWorker: z.number().int().positive().optional(),
    maxUptimeMsPerWorker: z.number().int().positive().optional(),
    maxConcurrentPerPlugin: z.number().int().positive().optional(),
    warmup: z.object({
      mode: z.enum(['none', 'top-n', 'marked']).optional(),
      topN: z.number().int().positive().optional(),
      maxHandlers: z.number().int().positive().optional(),
    }).optional(),
  }).optional(),

  remote: z.object({
    endpoint: z.string().url().optional(),
  }).optional(),

  container: ContainerExecutionConfigSchema.optional(),

  retry: ExecutionRetryConfigSchema.optional(),
}).superRefine((cfg, ctx) => {
  // If mode=container, container config must be present
  if (cfg.mode === 'container' && !cfg.container) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['container'],
      message: 'execution.container is required when mode is "container"',
    });
  }

  // If mode=remote, remote.endpoint must be present
  if (cfg.mode === 'remote' && !cfg.remote?.endpoint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['remote', 'endpoint'],
      message: 'execution.remote.endpoint is required when mode is "remote"',
    });
  }
});

export type ExecutionConfigInput = z.input<typeof ExecutionConfigSchema>;
export type ExecutionConfigParsed = z.output<typeof ExecutionConfigSchema>;

/**
 * Validate ExecutionConfig at startup.
 * Throws a descriptive error on misconfiguration.
 */
export function validateExecutionConfig(raw: unknown): ExecutionConfigParsed {
  const result = ExecutionConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid execution config:\n${issues}`);
  }
  return result.data;
}
