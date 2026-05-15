/**
 * @module @kb-labs/notifier-router/notifier-impl
 * INotifier implementation — subscribes to EventBus on start, fans out to channels.
 */

import { ulid } from 'ulid';
import type {
  IEventBus,
  ILogger,
  INotifier,
  INotifierChannel,
  NotificationEvent,
  NotificationFilter,
  NotifierDeliveryEvent,
  Unsubscribe,
} from '@kb-labs/core-platform';
import type { NotifierRoutingRule } from '@kb-labs/core-runtime';

export const NOTIFICATION_TOPIC = 'notification.emitted';
export const DELIVERY_SUCCESS_TOPIC = 'notifier-delivery.success';
export const DELIVERY_FAILED_TOPIC = 'notifier-delivery.failed';

export interface NotifierImplOptions {
  eventBus: IEventBus;
  logger: ILogger;
  channels: Record<string, INotifierChannel>;
  routing: NotifierRoutingRule[];
}

export class NotifierImpl implements INotifier {
  private unsubscribe?: Unsubscribe;

  constructor(private opts: NotifierImplOptions) {
    // Subscribe immediately on construction (platform wires this after adapter load).
    this.unsubscribe = this.opts.eventBus.subscribe<NotificationEvent>(
      NOTIFICATION_TOPIC,
      (event) => this.handle(event)
    );
    this.opts.logger.info('NotifierRouter ready', {
      topic: NOTIFICATION_TOPIC,
      channels: Object.keys(this.opts.channels),
    });
  }

  async notify(
    event: Omit<NotificationEvent, 'id' | 'emittedAt'> & { source?: string }
  ): Promise<void> {
    const full: NotificationEvent = {
      ...event,
      id: ulid(),
      emittedAt: Date.now(),
    };
    await this.opts.eventBus.publish(NOTIFICATION_TOPIC, full);
  }

  subscribe(
    filter: NotificationFilter,
    handler: (event: NotificationEvent) => Promise<void>
  ): () => void {
    return this.opts.eventBus.subscribe<NotificationEvent>(NOTIFICATION_TOPIC, async (e) => {
      if (filter.severity?.length && !filter.severity.includes(e.severity ?? 'info')) return;
      if (filter.source && e.source !== filter.source) return;
      if (filter.predicate && !filter.predicate(e)) return;
      await handler(e);
    });
  }

  /** Stop consuming eventBus (called on platform shutdown). */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async handle(event: NotificationEvent): Promise<void> {
    const channelIds = this.matchRouting(event);
    if (channelIds.length === 0) return;
    await Promise.allSettled(channelIds.map((id) => this.dispatch(event, id)));
  }

  private async dispatch(event: NotificationEvent, channelId: string): Promise<void> {
    const channel = this.opts.channels[channelId];
    if (!channel) {
      this.opts.logger.warn('NotifierRouter: unknown channel in routing', { channelId });
      return;
    }
    if (!channel.isAvailable()) {
      this.opts.logger.warn('NotifierRouter: channel unavailable', { channelId });
      return;
    }

    try {
      await channel.send(event);
      const delivery: NotifierDeliveryEvent = {
        notificationId: event.id,
        channelId,
        success: true,
        attempt: 1,
        at: Date.now(),
      };
      await this.opts.eventBus.publish(DELIVERY_SUCCESS_TOPIC, delivery);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.opts.logger.error('NotifierRouter: dispatch failed', error, {
        channelId,
        notificationId: event.id,
      });
      const delivery: NotifierDeliveryEvent = {
        notificationId: event.id,
        channelId,
        success: false,
        error: { message: error.message },
        attempt: 1,
        at: Date.now(),
      };
      await this.opts.eventBus.publish(DELIVERY_FAILED_TOPIC, delivery);
    }
  }

  /** First-match routing (firewall semantics: top-down). */
  private matchRouting(event: NotificationEvent): string[] {
    for (const rule of this.opts.routing) {
      const { match } = rule;
      if (match.severity?.length && !match.severity.includes(event.severity ?? 'info')) continue;
      if (match.source && event.source !== match.source) continue;
      if (match.code && event.code !== match.code) continue;
      return rule.channels;
    }
    return [];
  }
}
