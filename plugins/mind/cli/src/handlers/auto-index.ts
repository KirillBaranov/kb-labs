/**
 * @module @kb-labs/mind/handlers/auto-index
 * Auto-index handler - runs Mind RAG indexing automatically on schedule
 */

import type { PlatformServices } from '@kb-labs/sdk';
import { runRagIndex } from '../features/rag';

interface AutoIndexInput {
  scopeId?: string;
}

interface AutoIndexOutput {
  success: boolean;
  scopeIds: string[];
  duration?: number;
  error?: string;
}

// Extended handler context with optional platform
// TODO: docs/tasks/TASK-003-plugin-context-platform-unification.md
// Temporary workaround: Handler<I,O> from plugin-manifest doesn't have platform
interface AutoIndexContext {
  requestId: string;
  cwd: string;
  logger?: { info(...a: any[]): void; error(...a: any[]): void };
  platform?: PlatformServices;
}

/**
 * Auto-index handler
 *
 * Runs Mind RAG indexing for specified scope (or all scopes if not specified).
 * This handler is invoked by the worker daemon based on the schedule defined
 * in manifest.v3.ts jobs section.
 */
export const run = async (input: AutoIndexInput, ctx: AutoIndexContext): Promise<AutoIndexOutput> => {
  const startTime = Date.now();

  ctx.logger?.info('Auto-index job started', {
    scopeId: input.scopeId,
    cwd: ctx.cwd,
  });

  try {
    const result = await runRagIndex({
      cwd: ctx.cwd,
      scopeId: input.scopeId,
      platform: ctx.platform,
    });

    const duration = Date.now() - startTime;

    ctx.logger?.info('Auto-index job completed', {
      scopeIds: result.scopeIds,
      duration,
    });

    return {
      success: true,
      scopeIds: result.scopeIds,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.logger?.error('Auto-index job failed', {
      error: errorMessage,
      duration,
    });

    return {
      success: false,
      scopeIds: [],
      duration,
      error: errorMessage,
    };
  }
};
