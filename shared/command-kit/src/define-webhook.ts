/**
 * Define a webhook handler
 */

import type { PluginContextV3, CommandResult, HostContext } from '@kb-labs/plugin-contracts';

export interface WebhookHandler<TConfig = unknown, TInput = unknown> {
  /**
   * Execute the webhook handler
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

export interface WebhookDefinition<TConfig = unknown, TInput = unknown> {
  /**
   * Event name (e.g., "github:push", "stripe:payment.success")
   */
  event: string;

  /**
   * Webhook description
   */
  description?: string;

  /**
   * Handler implementation
   */
  handler: WebhookHandler<TConfig, TInput>;

  /**
   * Optional input schema validation (future: use Zod/JSON Schema)
   */
  schema?: unknown;
}

/**
 * Define a webhook handler
 *
 * @example
 * ```typescript
 * export default defineWebhook({
 *   event: 'github:push',
 *   description: 'Handle GitHub push events',
 *   handler: {
 *     async execute(context, input: { ref: string; commits: any[] }) {
 *       const { event, source, payload } = context.hostContext as WebhookHost;
 *
 *       context.ui.info(`Received ${event} from ${source}`);
 *
 *       // Process webhook...
 *
 *       return {
 *         data: { processed: true },
 *         exitCode: 0,
 *       };
 *     }
 *   }
 * });
 * ```
 */
export function defineWebhook<TConfig = unknown, TInput = unknown>(
  definition: WebhookDefinition<TConfig, TInput>
): WebhookHandler<TConfig, TInput> {
  // Validate host type at runtime
  const wrappedHandler: WebhookHandler<TConfig, TInput> = {
    execute: async (context, input) => {
      // Ensure we're running in webhook host
      if (context.host !== 'webhook') {
        throw new Error(
          `Webhook ${definition.event} can only run in webhook host (current: ${context.host})`
        );
      }

      // Validate event if provided in host context
      if (isWebhookHost(context.hostContext)) {
        const expectedEvent = definition.event;
        const actualEvent = context.hostContext.event;
        if (actualEvent !== expectedEvent) {
          throw new Error(
            `Webhook expects event ${expectedEvent} but got ${actualEvent}`
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
 * Type guard to check if host context is webhook
 */
export function isWebhookHost(
  hostContext: HostContext
): hostContext is Extract<HostContext, { host: 'webhook' }> {
  return hostContext.host === 'webhook';
}
