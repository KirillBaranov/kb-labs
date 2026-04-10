/**
 * Command definition helpers
 *
 * Re-exports from @kb-labs/shared-command-kit
 */

export {
  defineCommand,
  isCLIHost,
  type CommandHandler,
  type CommandDefinition,
  type CLIInput,
} from '@kb-labs/shared-command-kit';

export {
  defineRoute,
  isRESTHost,
  type RouteHandler,
  type RouteDefinition,
} from '@kb-labs/shared-command-kit';

export {
  defineAction,
  isWorkflowHost,
  type ActionHandler,
  type ActionDefinition,
} from '@kb-labs/shared-command-kit';

export {
  defineWebhook,
  isWebhookHost,
  type WebhookHandler,
  type WebhookDefinition,
} from '@kb-labs/shared-command-kit';

export {
  defineWebSocket,
  isWSHost,
  type WebSocketHandler,
  type WebSocketDefinition,
  type TypedSender,
} from '@kb-labs/shared-command-kit';

export {
  defineMessage,
  MessageBuilder,
  MessageRouter,
} from '@kb-labs/shared-command-kit';
