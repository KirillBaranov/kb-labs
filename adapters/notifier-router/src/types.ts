/**
 * @module @kb-labs/notifier-router/types
 */

import type { IEventBus, ILogger, INotifierChannel } from '@kb-labs/core-platform';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import type { NotifierAdapterOptions } from '@kb-labs/core-runtime';

export interface NotifierRouterDeps {
  eventBus: IEventBus;
  broker: IResourceBroker;
  logger: ILogger;
  /** Pre-built channel instances resolved by the platform loader. */
  channels: Record<string, INotifierChannel>;
}

export type { NotifierAdapterOptions };
