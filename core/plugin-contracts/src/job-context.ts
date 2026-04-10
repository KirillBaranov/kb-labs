/**
 * @module @kb-labs/plugin-contracts/job-context
 * Job execution context and handler types
 */

import type { ILogger } from '@kb-labs/core-platform';
import type { PlatformServices } from './platform.js';
import type { StateAPI } from './api.js';
import type { EventsAPI } from './api.js';
import type { ShellAPI } from './api.js';

/**
 * Context passed to job handler
 *
 * Similar to plugin Context but job-specific.
 * Handlers receive this in sandboxed subprocess.
 */
export interface JobContext {
  /**
   * Job identifier (unique ID)
   */
  jobId: string;

  /**
   * Job type (pluginId:jobId format)
   * @example "@kb-labs/notifications:send-email"
   */
  type: string;

  /**
   * Input payload (from job submission)
   */
  input: unknown;

  /**
   * Tenant ID (for multi-tenancy)
   */
  tenantId: string;

  /**
   * Current attempt number (1-indexed)
   * Increments on retry
   */
  attempt: number;

  /**
   * Logger scoped to this job
   */
  logger: ILogger;

  /**
   * Platform adapters (same as plugin ctx.platform)
   * Access to llm, embeddings, cache, etc.
   */
  platform: PlatformServices;

  /**
   * Update job progress (0-100)
   *
   * Sends progress update to job scheduler and emits event.
   *
   * @param percent - Progress percentage (0-100)
   * @param message - Optional status message
   *
   * @example
   * ```typescript
   * await ctx.updateProgress(10, 'Loading data');
   * await processData();
   * await ctx.updateProgress(50, 'Processing');
   * await saveResults();
   * await ctx.updateProgress(100, 'Complete');
   * ```
   */
  updateProgress(percent: number, message?: string): Promise<void>;

  /**
   * State API (scoped to plugin + tenant)
   *
   * Key-value storage with TTL support.
   * Keys automatically prefixed with tenant:{tenantId}:plugin:{pluginId}:
   */
  state: StateAPI;

  /**
   * Events API
   *
   * Publish events to platform event bus.
   */
  events: EventsAPI;

  /**
   * Shell API (if permitted)
   *
   * Execute shell commands (requires shell permissions in manifest).
   */
  shell?: ShellAPI;
}

/**
 * Job handler function signature
 *
 * Handlers are exported from job handler files and executed in sandbox.
 *
 * @example
 * ```typescript
 * // ./dist/jobs/send-email.js
 * import type { JobHandler } from '@kb-labs/plugin-contracts';
 *
 * export const handle: JobHandler = async (ctx) => {
 *   const { to, subject, body } = ctx.input;
 *
 *   await ctx.updateProgress(10, 'Connecting to SendGrid');
 *   await sendgrid.send({ to, subject, body });
 *
 *   await ctx.updateProgress(100, 'Email sent');
 *
 *   return { sent: true, messageId: '...' };
 * };
 * ```
 */
export type JobHandler = (ctx: JobContext) => Promise<unknown>;
