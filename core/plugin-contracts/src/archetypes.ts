/**
 * CLI Command Archetypes
 *
 * Opt-in TypeScript interfaces for plugin authors who declare `operationType`
 * in their manifest. Implementing these interfaces is purely voluntary —
 * the platform does NOT enforce them at runtime.
 *
 * The handler always receives `input.flags['dry-run']` / `input.flags['wait']`
 * etc. and is responsible for routing to `intent()` or `execute()` itself.
 *
 * Usage:
 *   import type { MutateHandler } from '@kb-labs/plugin-contracts';
 *
 *   export default defineCommand<unknown, CLIInput<MyFlags>, MyResult>({
 *     handler: {
 *       async execute(ctx, input) {
 *         if (input.flags['dry-run']) {
 *           return intent(ctx, input);   // show preview, exit 0
 *         }
 *         // ... actual work
 *       }
 *     }
 *   });
 */

/** Minimal CLI input shape — mirrors CLIInput from @kb-labs/shared-command-kit */
export interface ArchetypeInput<F = Record<string, unknown>> {
  argv: string[];
  flags: F;
}

// ─── Intent shapes ──────────────────────────────────────────────────────────

export interface MutateOperation {
  type: 'create' | 'update' | 'delete';
  resource: string;
  details?: unknown;
}

/** Describes what a mutate command *would* do (for --dry-run preview) */
export interface MutateIntent {
  summary: string;
  operations: MutateOperation[];
}

/** Describes what an execute command *would* do (for --dry-run preview) */
export interface ExecuteIntent {
  summary: string;
  estimatedDurationMs?: number;
}

// ─── Handler interfaces ─────────────────────────────────────────────────────

/**
 * Handler interface for commands with `operationType: 'mutate'`.
 * Implement `intent()` to support `--dry-run` previews.
 */
export interface MutateHandler<F = Record<string, unknown>> {
  intent(ctx: unknown, input: ArchetypeInput<F>): Promise<MutateIntent>;
  execute(ctx: unknown, input: ArchetypeInput<F>): Promise<unknown>;
}

/**
 * Handler interface for commands with `operationType: 'execute'`.
 * Implement `intent()` to support `--dry-run` previews.
 */
export interface ExecuteHandler<F = Record<string, unknown>> {
  intent(ctx: unknown, input: ArchetypeInput<F>): Promise<ExecuteIntent>;
  execute(ctx: unknown, input: ArchetypeInput<F>): Promise<unknown>;
}
