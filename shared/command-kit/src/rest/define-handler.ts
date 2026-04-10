/**
 * REST Handler Definition (V3)
 *
 * Define REST handlers compatible with plugin-runtime's runInProcess().
 * Returns { execute } object with (ctx, input) signature.
 *
 * @example
 * ```typescript
 * import { defineHandler } from '@kb-labs/shared-command-kit';
 *
 * export default defineHandler({
 *   async execute(ctx, input: { scope?: string }) {
 *     const plan = await loadPlan(ctx.cwd);
 *     return plan;
 *   }
 * });
 * ```
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

/**
 * REST input structure from route-mounter.
 * Query params, body, and route params are separated to avoid conflicts.
 */
export interface RestInput<TQuery = unknown, TBody = unknown, TParams = unknown> {
  query?: TQuery;
  body?: TBody;
  params?: TParams;
}

/**
 * Handler interface expected by runInProcess().
 */
export interface Handler<TConfig = unknown, TInput = unknown, TOutput = unknown> {
  /**
   * Execute the handler
   */
  execute(
    ctx: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<TOutput>;
}

/**
 * Handler definition options.
 * Extensible for future features (inputSchema, middleware, etc.)
 */
export interface HandlerDefinition<TConfig = unknown, TInput = unknown, TOutput = unknown> {
  /**
   * Execute the handler.
   * Returns data directly - no need for exitCode/CommandResult wrapper.
   *
   * @param ctx - Plugin context with runtime APIs (fs, fetch, env, ui, etc.)
   * @param input - Request input (body for POST, query for GET, etc.)
   * @returns Response data (will be serialized as JSON)
   * @throws Error on failure (will be converted to HTTP 500)
   */
  execute(
    ctx: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<TOutput>;

  // Future options (non-breaking additions):
  // inputSchema?: ZodType<TInput>;
  // outputSchema?: ZodType<TOutput>;
  // middleware?: Middleware[];
  // timeout?: number;
}

/**
 * Define a REST handler
 *
 * Creates a handler object compatible with runInProcess() from plugin-runtime.
 * The handler receives full PluginContextV3 with runtime APIs.
 *
 * @example
 * ```typescript
 * // Simple handler
 * export default defineHandler({
 *   async execute(ctx, input: { scope?: string }) {
 *     const plan = await loadPlan(ctx.cwd);
 *     return plan;
 *   }
 * });
 *
 * // With typed query parameters using RestInput
 * import { defineHandler, type RestInput } from '@kb-labs/sdk';
 *
 * export default defineHandler({
 *   async execute(ctx, input: RestInput<{ workspace?: string }>) {
 *     const workspace = input.query?.workspace || 'root';
 *     return { workspace };
 *   }
 * });
 *
 * // With typed query and body
 * interface QueryParams {
 *   workspace?: string;
 * }
 *
 * interface BodyParams {
 *   name: string;
 *   description?: string;
 * }
 *
 * export default defineHandler({
 *   async execute(ctx, input: RestInput<QueryParams, BodyParams>) {
 *     const workspace = input.query?.workspace || 'root';
 *     const name = input.body?.name;
 *     return { workspace, name };
 *   }
 * });
 *
 * // With typed generics
 * interface GetPlanInput {
 *   scope?: string;
 *   includeHistory?: boolean;
 * }
 *
 * interface ReleasePlan {
 *   version: string;
 *   packages: string[];
 * }
 *
 * export default defineHandler<unknown, GetPlanInput, ReleasePlan>({
 *   async execute(ctx, input) {
 *     // ctx: PluginContextV3 with runtime.fs, ui, etc.
 *     // input: GetPlanInput (typed)
 *     // return: ReleasePlan (typed)
 *     return await loadPlan(ctx.cwd, input.scope);
 *   }
 * });
 *
 * // Using runtime APIs
 * export default defineHandler({
 *   async execute(ctx, input: { path: string }) {
 *     // File system access
 *     const content = await ctx.runtime.fs.readFile(input.path, 'utf-8');
 *
 *     // Environment variables
 *     const apiKey = ctx.runtime.env('API_KEY');
 *
 *     // Logging
 *     ctx.runtime.log('info', 'Processing file', { path: input.path });
 *
 *     return { content, hasApiKey: !!apiKey };
 *   }
 * });
 * ```
 */
export function defineHandler<TConfig = unknown, TInput = unknown, TOutput = unknown>(
  definition: HandlerDefinition<TConfig, TInput, TOutput>
): Handler<TConfig, TInput, TOutput> {
  // Return handler object compatible with runInProcess()
  // Currently passes through, but this wrapper enables:
  // - Future input validation via inputSchema
  // - Future output validation via outputSchema
  // - Middleware execution
  // - Logging/tracing hooks
  // - Error normalization
  return {
    execute: async (ctx, input) => {
      // Future: validate input against schema
      // if (definition.inputSchema) {
      //   input = definition.inputSchema.parse(input);
      // }

      // Future: run pre-middleware
      // for (const mw of definition.middleware ?? []) {
      //   await mw.before?.(ctx, input);
      // }

      // Future: validate output against schema
      // if (definition.outputSchema) {
      //   definition.outputSchema.parse(result);
      // }

      // Future: run post-middleware
      // for (const mw of definition.middleware ?? []) {
      //   await mw.after?.(ctx, input, result);
      // }

      return definition.execute(ctx, input);
    },
  };
}
