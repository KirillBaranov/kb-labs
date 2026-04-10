/**
 * Define a workflow action handler
 */

import type { PluginContextV3, CommandResult, HostContext } from '@kb-labs/plugin-contracts';

export interface ActionHandler<TConfig = unknown, TInput = unknown> {
  /**
   * Execute the workflow action
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

export interface ActionDefinition<TConfig = unknown, TInput = unknown> {
  /**
   * Action ID (e.g., "send-email")
   */
  id: string;

  /**
   * Action description
   */
  description?: string;

  /**
   * Handler implementation
   */
  handler: ActionHandler<TConfig, TInput>;

  /**
   * Optional input schema validation (future: use Zod/JSON Schema)
   */
  schema?: unknown;
}

/**
 * Define a workflow action
 *
 * @example
 * ```typescript
 * export default defineAction({
 *   id: 'send-email',
 *   description: 'Send an email notification',
 *   handler: {
 *     async execute(context, input: { to: string; subject: string; body: string }) {
 *       // Access workflow context
 *       const { workflowId, runId, stepId } = context.hostContext as WorkflowHost;
 *
 *       context.ui.info(`Sending email in workflow ${workflowId}`);
 *
 *       // Send email...
 *
 *       return {
 *         data: { sent: true, messageId: '123' },
 *         exitCode: 0,
 *       };
 *     }
 *   }
 * });
 * ```
 */
export function defineAction<TConfig = unknown, TInput = unknown>(
  definition: ActionDefinition<TConfig, TInput>
): ActionHandler<TConfig, TInput> {
  // Validate host type at runtime
  const wrappedHandler: ActionHandler<TConfig, TInput> = {
    execute: (context, input) => {
      // Ensure we're running in workflow host
      if (context.host !== 'workflow') {
        throw new Error(
          `Action ${definition.id} can only run in workflow host (current: ${context.host})`
        );
      }

      // Call the actual handler
      return definition.handler.execute(context, input);
    },

    cleanup: definition.handler.cleanup,
  };

  return wrappedHandler;
}

/**
 * Type guard to check if host context is workflow
 */
export function isWorkflowHost(
  hostContext: HostContext
): hostContext is Extract<HostContext, { host: 'workflow' }> {
  return hostContext.host === 'workflow';
}
