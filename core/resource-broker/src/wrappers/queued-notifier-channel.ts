/**
 * @module @kb-labs/core-resource-broker/wrappers/queued-notifier-channel
 * QueuedNotifierChannel — INotifierChannel wrapper that routes send() through ResourceBroker.
 *
 * Provides rate-limiting, retry with exponential backoff, priority queue, and
 * distributed quota (via StateBroker) for free — same as QueuedLLM.
 */

import type { INotifierChannel, NotificationCapability, NotificationEvent } from '@kb-labs/core-platform';
import type { IResourceBroker, ResourcePriority } from '../types.js';

function severityToPriority(severity: NotificationEvent['severity']): ResourcePriority {
  if (severity === 'critical') return 'high';
  if (severity === 'warn') return 'normal';
  return 'low';
}

export class QueuedNotifierChannel implements INotifierChannel {
  constructor(
    private broker: IResourceBroker,
    private channel: INotifierChannel
  ) {}

  get id(): string { return this.channel.id; }
  get capabilities(): NotificationCapability[] { return this.channel.capabilities; }
  isAvailable(): boolean { return this.channel.isAvailable(); }

  async send(event: NotificationEvent): Promise<void> {
    const response = await this.broker.enqueue<void>({
      resource: `notifier:${this.channel.id}`,
      operation: 'send',
      args: [event],
      priority: severityToPriority(event.severity),
      estimatedTokens: 1,
    });

    if (!response.success) {
      throw response.error ?? new Error(`Notifier channel '${this.channel.id}' send failed`);
    }
  }
}

export function createQueuedNotifierChannel(
  broker: IResourceBroker,
  channel: INotifierChannel
): QueuedNotifierChannel {
  return new QueuedNotifierChannel(broker, channel);
}
