/**
 * Define a REST API route handler
 */

import type { PluginContextV3, CommandResult, HostContext } from '@kb-labs/plugin-contracts';

export interface RouteHandler<TConfig = unknown, TInput = unknown> {
  /**
   * Execute the route handler
   */
  execute(
    context: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<CommandResult | void> | CommandResult | void;

  /**
   * Optional cleanup - called after execute completes
   */
  cleanup?(): Promise<void> | void;
}

export interface RouteDefinition<TConfig = unknown, TInput = unknown> {
  /**
   * Route path (e.g., "/api/greet")
   */
  path: string;

  /**
   * HTTP method (e.g., "GET", "POST")
   */
  method: string;

  /**
   * Route description
   */
  description?: string;

  /**
   * Handler implementation
   */
  handler: RouteHandler<TConfig, TInput>;

  /**
   * Optional input schema validation (future: use Zod/JSON Schema)
   */
  schema?: unknown;
}

/**
 * Define a REST API route
 *
 * @example
 * ```typescript
 * export default defineRoute({
 *   path: '/greet',
 *   method: 'POST',
 *   description: 'Greet a user',
 *   handler: {
 *     async execute(context, input: { name: string }) {
 *       return {
 *         data: { message: `Hello, ${input.name}!` },
 *         exitCode: 0,
 *       };
 *     }
 *   }
 * });
 * ```
 */
export function defineRoute<TConfig = unknown, TInput = unknown>(
  definition: RouteDefinition<TConfig, TInput>
): RouteHandler<TConfig, TInput> {
  // Validate host type at runtime
  const wrappedHandler: RouteHandler<TConfig, TInput> = {
    execute: async (context, input) => {
      // Ensure we're running in REST host
      if (context.host !== 'rest') {
        throw new Error(
          `Route ${definition.path} can only run in REST host (current: ${context.host})`
        );
      }

      // Validate method if provided in host context
      if (isRESTHost(context.hostContext)) {
        const expectedMethod = definition.method.toUpperCase();
        const actualMethod = context.hostContext.method.toUpperCase();
        if (actualMethod !== expectedMethod) {
          throw new Error(
            `Route ${definition.path} expects ${expectedMethod} but got ${actualMethod}`
          );
        }
      }

      // Call the actual handler with error handling
      try {
        return await definition.handler.execute(context, input);
      } finally {
        // Always call cleanup, even if handler throws
        await definition.handler.cleanup?.();
      }
    },

    cleanup: definition.handler.cleanup,
  };

  return wrappedHandler;
}

/**
 * Type guard to check if host context is REST
 */
export function isRESTHost(hostContext: HostContext): hostContext is Extract<HostContext, { host: 'rest' }> {
  return hostContext.host === 'rest';
}
