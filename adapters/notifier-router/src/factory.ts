/**
 * @module @kb-labs/notifier-router/factory
 * Standard adapter factory — mirrors createAdapter pattern used by all kb-labs adapters.
 * loader.ts dynamically imports this and calls createAdapter(options, deps).
 *
 * Channels are pre-built by the platform loader (it resolves type → package).
 * This factory knows nothing about specific channel implementations.
 */

import type { INotifier, INotifierChannel } from '@kb-labs/sdk/adapters';
import { createQueuedNotifierChannel } from '@kb-labs/sdk/adapters/infra';
import type { NotifierAdapterOptions } from '@kb-labs/sdk/adapters/infra';
import { NotifierImpl } from './notifier-impl.js';
import type { NotifierRouterDeps } from './types.js';

/**
 * Standard adapter factory called by loader.ts via dynamic import.
 * config = adapterOptions.notifier from kb.config.json.
 * deps.channels = channel instances already built by the platform loader.
 */
export function createAdapter(
  config: NotifierAdapterOptions,
  deps: NotifierRouterDeps
): INotifier {
  const channels: Record<string, INotifierChannel> = {};

  for (const [id, channel] of Object.entries(deps.channels)) {
    deps.broker.register(`notifier:${id}`, {
      rateLimits: { requestsPerSecond: channel.rateLimit ?? 10 },
      executor: async (_operation: string, args: unknown[]) => {
        const event = args[0] as Parameters<INotifierChannel['send']>[0];
        return channel.send(event);
      },
    });
    channels[id] = createQueuedNotifierChannel(deps.broker, channel);
  }

  return new NotifierImpl({
    eventBus: deps.eventBus,
    logger: deps.logger,
    channels,
    routing: config.routing ?? [],
  });
}

/** Convenience wrapper for programmatic use (e.g. tests). */
export { createAdapter as createNotifierAdapter };
