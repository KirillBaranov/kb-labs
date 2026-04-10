/**
 * @module @kb-labs/shared-command-kit
 * System Command Definition - For KB Labs official commands with full privileges
 */

import {
  type CommandResult,
  type FlagSchemaDefinition,
  type InferFlags,
  defineFlags,
  validateFlags,
  FlagValidationError,
} from './index';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';
import { formatError } from './errors/index';

/**
 * Flag definition for Command interface
 */
interface FlagDefinition {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  alias?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  choices?: string[];
}

/**
 * Command definition for system commands
 */
export interface Command {
  name: string;
  describe: string;
  longDescription?: string;
  category?: string;
  aliases?: string[];
  flags?: FlagDefinition[];
  examples?: string[];
  run: (ctx: PluginContextV3, argv: string[], flags: Record<string, unknown>) => Promise<number>;
}

/**
 * Command group definition
 */
export interface CommandGroup {
  name: string;
  describe: string;
  commands: Command[];
  subgroups?: CommandGroup[];
}

/**
 * Convert flag schema definition to FlagDefinition[] format
 * Used for compatibility with Command interface
 */
function convertFlagSchema(schema: FlagSchemaDefinition): FlagDefinition[] {
  return Object.entries(schema).map(([name, def]) => {
    const result: FlagDefinition = {
      name,
      type: def.type,
      alias: def.alias,
      description: def.description,
      default: def.default,
      required: def.required,
    };
    
    // Add choices if present (for string flags with choices)
    if (def.type === 'string' && 'choices' in def && Array.isArray(def.choices)) {
      result.choices = [...def.choices];
    }
    
    return result;
  });
}

/**
 * Extended command config for system commands
 *
 * All type parameters are optional - use them when you want type safety, skip them for simplicity.
 *
 * TFlags can be inferred from the flags schema, but can also be explicitly provided
 * for better type inference in complex cases.
 *
 * TResult must extend CommandResult (requires ok: boolean field).
 */
export interface SystemCommandConfig<
  TFlags extends FlagSchemaDefinition = FlagSchemaDefinition,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
> {
  /** Command name (required for system commands) */
  name: string;
  /** Command description (required for system commands) */
  description: string;
  /** Long description for help */
  longDescription?: string;
  /** Category (defaults to 'system') */
  category?: string;
  /** Command aliases */
  aliases?: string[];
  /** Usage examples */
  examples?: string[];
  /** Flag schema definition - TypeScript will infer TFlags from this */
  flags: TFlags;
  /**
   * Analytics configuration (legacy field, kept for backward compatibility)
   * Use ctx.platform.analytics.track() or withAnalytics() helper instead
   */
  analytics?: {
    command?: string;
    startEvent?: string;
    finishEvent?: string;
    actor?: string;
    context?: Record<string, unknown>;
    includeFlags?: boolean;
  };
  /** Command handler - receives PluginContextV3 and must return TResult */
  handler: (ctx: PluginContextV3, argv: TArgv, flags: InferFlags<TFlags>) => Promise<number | TResult> | number | TResult;
  /** Optional formatter - receives TResult with inferred flags */
  formatter?: (result: TResult, ctx: PluginContextV3, flags: InferFlags<TFlags>, argv?: TArgv) => void;
}

/**
 * Define a system command with full privileges
 * 
 * System commands are KB Labs official commands that run with full system access,
 * bypassing sandbox restrictions. They are architecturally separated from plugin
 * commands - plugins can NEVER gain system privileges.
 * 
 * TResult is REQUIRED - every command must explicitly declare its result contract.
 * This ensures type safety and enables future contract validation.
 * 
 * @example
 * ```typescript
 * import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
 *
 * // Simple command with automatic flag type inference (RECOMMENDED)
 * export const helloCommand = defineSystemCommand<CommandResult & { message: string }>({
 *   name: 'hello',
 *   description: 'Print a friendly greeting',
 *   category: 'system',
 *   flags: {
 *     name: { type: 'string', description: 'Name to greet' },
 *     json: { type: 'boolean', default: false },
 *   } satisfies FlagSchemaDefinition, // Preserves literal types for type inference
 *   async handler(ctx, argv, flags) {
 *     // ctx is EnhancedCliContext (extends PluginContextV3)
 *     // ctx.cwd - working directory (V2 promoted field)
 *     // ctx.ui - UI output API with new convenience methods
 *     // flags.name is inferred as string | undefined
 *     const message = `Hello, ${flags.name || 'World'}!`;
 *
 *     // UI output (CLI only, no-op in REST/Workflow)
 *     if (!flags.json) {
 *       if (ctx.ui?.success) {
 *         ctx.ui.success('Greeting', [
 *           { items: [message] },
 *         ]);
 *       }
 *     } else {
 *       ctx.ui?.json({ message });
 *     }
 *
 *     return { ok: true, message };
 *   },
 * });
 * 
 * // Command with explicit result type and automatic flag inference
 * type WorkflowListResult = CommandResult & {
 *   workflows: Array<{ id: string }>;
 *   total: number;
 * };
 *
 * export const wfList = defineSystemCommand<WorkflowListResult>({
 *   name: 'list',
 *   description: 'List workflows',
 *   flags: {
 *     source: { type: 'string', default: 'all' },
 *     tag: { type: 'string' },
 *     json: { type: 'boolean', default: false },
 *   } satisfies FlagSchemaDefinition, // TypeScript infers flag types automatically
 *   async handler(ctx, argv, flags) {
 *     // flags.source is inferred as string
 *     // flags.tag is inferred as string | undefined
 *     // flags.json is inferred as boolean
 *     const workflows = await listWorkflows(flags.source, flags.tag);
 *
 *     // UI output (new convenience methods)
 *     if (!flags.json) {
 *       if (ctx.ui?.success) {
 *         ctx.ui.success('Workflows', [
 *           { header: 'Summary', items: [`Total: ${workflows.length}`, `Source: ${flags.source}`] },
 *           { items: workflows.map(w => `• ${w.id}`) },
 *         ]);
 *       }
 *     } else {
 *       ctx.ui?.json({ workflows, total: workflows.length });
 *     }
 *
 *     return { ok: true, workflows, total: workflows.length };
 *   },
 * });
 * 
 * // Command with explicit flag types (for complex cases)
 * export const wfRun = defineSystemCommand<
 *   { 'workflow-id': { type: 'string'; required: true } },
 *   CommandResult & { run: WorkflowRun }
 * >({
 *   name: 'run',
 *   description: 'Execute a workflow',
 *   flags: {
 *     'workflow-id': { type: 'string', required: true },
 *   },
 *   async handler(ctx, argv, flags) {
 *     // flags['workflow-id'] is inferred as string (required)
 *
 *     // Progress tracking (CLI only, no-op in REST/Workflow)
 *     ctx.ui?.startProgress('running', 'Starting workflow...');
 *     const run = await executeWorkflow(flags['workflow-id']);
 *     ctx.ui?.completeProgress('running', 'Workflow started!');
 *
 *     return { ok: true, run };
 *   },
 * });
 *
 * // Note: System commands support all UI convenience methods:
 * // - ctx.ui.success() / showError() / warning() / info() - Result display with sideBox
 * // - ctx.ui.startProgress() / completeProgress() / failProgress() - Progress tracking
 * // - ctx.ui.table() / keyValue() / list() - Low-level formatting
 * // All UI methods are CLI-only and no-op in REST/Workflow contexts
 * ```
 */
// Overload for explicit TFlags and TResult
export function defineSystemCommand<
  TFlags extends FlagSchemaDefinition,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
>(
  config: SystemCommandConfig<TFlags, TResult, TArgv>
): Command;
// Implementation - all parameters optional with defaults
export function defineSystemCommand<
  TFlags extends FlagSchemaDefinition = FlagSchemaDefinition,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
>(
  config: SystemCommandConfig<TFlags, TResult, TArgv>
): Command {
  const { name, description, longDescription, category, aliases, examples, flags, handler, formatter } = config;

  // Return command with direct handler (no wrapping needed - system commands don't use V3 defineCommand)
  return {
    name,
    describe: description,
    longDescription,
    category: category || 'system',
    aliases: aliases || [],
    flags: flags ? convertFlagSchema(flags) : [],
    examples: examples || [],
    run: async (ctx: PluginContextV3, argv: string[], rawFlags: Record<string, unknown>) => {
      const jsonMode = Boolean(rawFlags.json);

      // Log command start
      ctx.platform?.logger?.info?.(`Command ${name} started`);

      // Validate flags only if schema is defined
      let validatedFlags: InferFlags<TFlags>;

      if (flags) {
        const flagSchema = defineFlags(flags);
        try {
          validatedFlags = await validateFlags(rawFlags, flagSchema) as InferFlags<TFlags>;
        } catch (error) {
          // Enhance validation error with command name
          if (error instanceof FlagValidationError && name && !error.commandName) {
            (error as { commandName?: string }).commandName = name;
          }

          // Show stack trace only in debug mode
          const showStack = Boolean(rawFlags.debug);
          const formatted = formatError(error, { showStack, jsonMode });

          if (jsonMode) {
            ctx.ui?.json(formatted.json);
          } else {
            ctx.ui?.error(formatted.message);
          }

          // Return specific exit code for validation errors
          return 3; // EXIT_CODES.INVALID_FLAGS
        }
      } else {
        // No schema defined - pass raw flags as-is
        validatedFlags = rawFlags as InferFlags<TFlags>;
      }

      // Call handler with error handling
      let result: number | TResult;
      try {
        result = await handler(ctx, argv as unknown as TArgv, validatedFlags);
      } catch (error) {
        // Log error to platform logger
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.platform?.logger?.error?.(`Command ${name} failed: ${errorMessage}`);

        // Display error to user
        if (jsonMode) {
          ctx.ui?.json({ ok: false, error: errorMessage });
        } else {
          ctx.ui?.error(errorMessage);
        }

        // Return error exit code
        return 1;
      }

      // Call formatter if provided and result is not a number
      if (formatter && typeof result !== 'number') {
        formatter(result as TResult, ctx, validatedFlags, argv as unknown as TArgv);
      }

      // Log command completion
      ctx.platform?.logger?.info?.(`Command ${name} completed`);

      // Convert result to exit code
      if (typeof result === 'number') {
        return result;
      }
      return result.ok ? 0 : 1;
    },
  };
}

/**
 * Create a system command group
 * 
 * Groups organize related system commands for better help organization
 * and registration.
 * 
 * @example
 * ```typescript
 * export const systemInfoGroup = defineSystemCommandGroup(
 *   'system:info',
 *   'System information commands',
 *   [helloCommand, versionCommand, healthCommand]
 * );
 * ```
 */
export function defineSystemCommandGroup(
  name: string,
  describe: string,
  commands: Command[]
): CommandGroup {
  return {
    name,
    describe,
    commands,
  };
}

