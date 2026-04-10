/**
 * Define a CLI command handler
 */

import type { PluginContextV3, CommandResult, HostContext } from '@kb-labs/plugin-contracts';

/**
 * CLI input wrapper - V3 plugin system wraps flags in this structure
 */
export interface CLIInput<TFlags = unknown> {
  flags: TFlags;
  argv: string[];
}

export interface CommandHandlerV3<TConfig = unknown, TInput = unknown, TResult = unknown> {
  /**
   * Execute the command
   */
  execute(
    context: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<CommandResult<TResult>> | CommandResult<TResult>;

  /**
   * Optional cleanup - called after execute completes
   */
  cleanup?(): Promise<void> | void;
}

export interface CommandDefinition<TConfig = unknown, TInput = unknown, TResult = unknown> {
  /**
   * Command ID (e.g., "my-plugin:greet")
   */
  id: string;

  /**
   * Command description
   */
  description?: string;

  /**
   * Handler implementation
   */
  handler: CommandHandlerV3<TConfig, TInput, TResult>;

  /**
   * Optional input schema validation (future: use Zod/JSON Schema)
   */
  schema?: unknown;
}

/**
 * Define a CLI command
 *
 * For CLI commands, use CLIInput<TFlags> as TInput type to get proper typing
 * for the V3 plugin system's { flags, argv } structure.
 *
 * @example
 * ```typescript
 * interface GreetFlags {
 *   name?: string;
 * }
 *
 * interface GreetResult {
 *   message: string;
 *   target: string;
 * }
 *
 * export default defineCommand<unknown, CLIInput<GreetFlags>, GreetResult>({
 *   id: 'greet',
 *   description: 'Greet a user',
 *   handler: {
 *     async execute(context, input) {
 *       const target = input.flags.name || 'World';
 *       context.ui.success(`Hello, ${target}!`);
 *
 *       return {
 *         exitCode: 0,
 *         result: { message: `Hello, ${target}!`, target },
 *         meta: { version: 'v3' }
 *       };
 *     }
 *   }
 * });
 * ```
 */
export function defineCommand<TConfig = unknown, TInput = unknown, TResult = unknown>(
  definition: CommandDefinition<TConfig, TInput, TResult>
): CommandHandlerV3<TConfig, TInput, TResult> {
  // Return the handler directly with host validation wrapper
  return {
    execute: (context, input) => {
      // Ensure we're running in CLI or workflow host
      if (context.host !== 'cli' && context.host !== 'workflow') {
        throw new Error(
          `Command ${definition.id} can only run in CLI or workflow host (current: ${context.host})`
        );
      }

      // Call the actual handler
      return definition.handler.execute(context, input);
    },

    cleanup: definition.handler.cleanup,
  } as CommandHandlerV3<TConfig, TInput, TResult>;
}

/**
 * Type guard to check if host context is CLI
 */
export function isCLIHost(hostContext: HostContext): hostContext is Extract<HostContext, { host: 'cli' }> {
  return hostContext.host === 'cli';
}
