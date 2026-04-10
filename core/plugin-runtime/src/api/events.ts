/**
 * Events API implementation
 */

import type { EventsAPI } from '@kb-labs/plugin-contracts';

/**
 * Event emitter function type
 */
export type EventEmitterFn = (event: string, payload?: unknown) => Promise<void>;

export interface CreateEventsAPIOptions {
  pluginId: string;
  emitter: EventEmitterFn;
}

/**
 * Create EventsAPI for publishing events
 */
export function createEventsAPI(options: CreateEventsAPIOptions): EventsAPI {
  const { pluginId, emitter } = options;

  return {
    async emit(event: string, payload?: unknown): Promise<void> {
      // Prefix event with plugin ID for namespacing
      const prefixedEvent = `${pluginId}:${event}`;
      await emitter(prefixedEvent, payload);
    },
  };
}

/**
 * Create a no-op events API (for when events are disabled)
 */
export function createNoopEventsAPI(): EventsAPI {
  return {
    async emit(): Promise<void> {
      // No-op
    },
  };
}
