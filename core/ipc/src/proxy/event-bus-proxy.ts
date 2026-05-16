/**
 * @module @kb-labs/core-ipc/proxy/event-bus-proxy
 *
 * Bidirectional EventBus proxy for child processes.
 *
 * publish  → adapter:call RPC (existing pattern)
 * subscribe → eventbus:subscribe (fire-and-forget) + eventbus:push (push from parent)
 * unsubscribe → eventbus:unsubscribe (fire-and-forget)
 */

import { randomUUID } from 'node:crypto';
import type { IEventBus, EventHandler, Unsubscribe } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport.js';
import { isEventBusPush, serialize, deserialize } from '@kb-labs/core-platform/serializable';
import { IPC_PROTOCOL_VERSION } from '@kb-labs/core-platform/serializable';

export class EventBusProxy implements IEventBus {
  private handlers = new Map<string, { topic: string; handler: EventHandler<unknown> }>();
  private unregisterPush: () => void;

  constructor(private readonly transport: ITransport) {
    this.unregisterPush = transport.onPushMessage(this.handlePush.bind(this));
  }

  async publish<T>(topic: string, event: T): Promise<void> {
    const response = await this.transport.send({
      version: IPC_PROTOCOL_VERSION,
      type: 'adapter:call',
      requestId: randomUUID(),
      adapter: 'eventBus',
      method: 'publish',
      args: [serialize(topic) as never, serialize(event) as never],
    });

    if (response.error) {
      const err = deserialize(response.error);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  subscribe<T>(topic: string, handler: EventHandler<T>): Unsubscribe {
    const subscriptionId = randomUUID();

    this.handlers.set(subscriptionId, { topic, handler: handler as EventHandler<unknown> });

    this.transport.sendMessage({
      type: 'eventbus:subscribe',
      subscriptionId,
      topic,
    });

    return () => {
      if (!this.handlers.has(subscriptionId)) { return; }
      this.handlers.delete(subscriptionId);
      this.transport.sendMessage({
        type: 'eventbus:unsubscribe',
        subscriptionId,
      });
    };
  }

  dispose(): void {
    this.unregisterPush();
    this.handlers.clear();
  }

  private handlePush(msg: unknown): void {
    if (!isEventBusPush(msg)) { return; }
    const entry = this.handlers.get(msg.subscriptionId);
    if (!entry) { return; }
    const payload = deserialize(msg.payload);
    entry.handler(payload).catch(() => {});
  }
}
