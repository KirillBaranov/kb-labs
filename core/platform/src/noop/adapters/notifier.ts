/**
 * @module @kb-labs/core-platform/noop/adapters/notifier
 *
 * NoOp `INotifier` — silently drops notifications, never throws.
 *
 * Unlike LLM/Embeddings, notifications are inherently fire-and-forget;
 * throwing would break plugins that legitimately don't care if no real
 * channel is configured. The loader prints ONE boot-summary INFO line so
 * operators know notifications are being dropped.
 *
 * `subscribe()` returns an unsubscribe no-op — handlers are never called
 * because nothing ever publishes through this channel.
 */

import type {
  INotifier,
  NotificationEvent,
  NotificationFilter,
} from '../../adapters/notifier.js';

export class NoOpNotifier implements INotifier {
  async notify(
    _event: Omit<NotificationEvent, 'id' | 'emittedAt'> & { source?: string },
  ): Promise<void> {
    // Silent drop. Loader emits one INFO at boot summarising "notifier dropped".
  }

  subscribe(
    _filter: NotificationFilter,
    _handler: (event: NotificationEvent) => Promise<void>,
  ): () => void {
    return () => { /* nothing to unsubscribe from */ };
  }
}
