/**
 * @module @kb-labs/notifier-router/types
 */

import type { IEventBus, ILogger, INotifierChannel } from '@kb-labs/sdk/adapters';
import type { IResourceBroker } from '@kb-labs/sdk/adapters/infra';
import type { NotifierAdapterOptions } from '@kb-labs/sdk/adapters/infra';

export interface NotifierRouterDeps {
  eventBus: IEventBus;
  broker: IResourceBroker;
  logger: ILogger;
  /** Pre-built channel instances resolved by the platform loader. */
  channels: Record<string, INotifierChannel>;
}

export type { NotifierAdapterOptions };
