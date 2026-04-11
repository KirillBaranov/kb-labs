/**
 * @module gateway-app/clients/subscription-registry
 *
 * Tracks which client connections are subscribed to which executions.
 * Gateway broadcasts ExecutionEvents to all subscribers of an execution.
 *
 * Lifecycle:
 *   - client sends client:subscribe   → subscribe(connectionId, executionId)
 *   - client sends client:unsubscribe → unsubscribe(connectionId, executionId)
 *   - execution emits event           → broadcast(executionId, event) → all subscribers
 *   - client disconnects              → removeConnection(connectionId) → cleanup
 *
 * The initiator of POST /api/v1/execute is NOT auto-subscribed here —
 * they receive events inline via ndjson stream. This registry is for
 * secondary observers joining an in-flight execution.
 */

import type { WebSocket } from '@fastify/websocket';
import type { ExecutionEventMessage } from '@kb-labs/gateway-contracts';

export interface ISubscriptionRegistry {
  subscribe(connectionId: string, executionId: string): void;
  unsubscribe(connectionId: string, executionId: string): void;
  getSubscribers(executionId: string): ReadonlySet<string>;
  getSubscriptions(connectionId: string): ReadonlySet<string>;
  /** Called on client disconnect. Returns executionIds that now have zero subscribers. */
  removeConnection(connectionId: string): string[];
  broadcast(executionId: string, event: ExecutionEventMessage): void;
}

export class SubscriptionRegistry implements ISubscriptionRegistry {
  /** executionId → Set<connectionId> */
  private readonly byExecution = new Map<string, Set<string>>();
  /** connectionId → Set<executionId> */
  private readonly byConnection = new Map<string, Set<string>>();
  /** connectionId → WebSocket (for sending events) */
  private readonly sockets = new Map<string, WebSocket>();

  /** Register a WebSocket for a connection. Must be called before subscribe(). */
  registerSocket(connectionId: string, socket: WebSocket): void {
    this.sockets.set(connectionId, socket);
  }

  /** Remove a connection's socket on disconnect. */
  removeSocket(connectionId: string): void {
    this.sockets.delete(connectionId);
  }

  subscribe(connectionId: string, executionId: string): void {
    let executionSubs = this.byExecution.get(executionId);
    if (!executionSubs) {
      executionSubs = new Set();
      this.byExecution.set(executionId, executionSubs);
    }
    executionSubs.add(connectionId);

    let connectionSubs = this.byConnection.get(connectionId);
    if (!connectionSubs) {
      connectionSubs = new Set();
      this.byConnection.set(connectionId, connectionSubs);
    }
    connectionSubs.add(executionId);
  }

  unsubscribe(connectionId: string, executionId: string): void {
    this.byExecution.get(executionId)?.delete(connectionId);
    this.byConnection.get(connectionId)?.delete(executionId);

    // GC empty sets
    if (this.byExecution.get(executionId)?.size === 0) {
      this.byExecution.delete(executionId);
    }
    if (this.byConnection.get(connectionId)?.size === 0) {
      this.byConnection.delete(connectionId);
    }
  }

  getSubscribers(executionId: string): ReadonlySet<string> {
    return this.byExecution.get(executionId) ?? new Set();
  }

  getSubscriptions(connectionId: string): ReadonlySet<string> {
    return this.byConnection.get(connectionId) ?? new Set();
  }

  removeConnection(connectionId: string): string[] {
    const subscriptions = this.byConnection.get(connectionId);
    if (!subscriptions) {
      this.sockets.delete(connectionId);
      return [];
    }

    const orphaned: string[] = [];
    for (const executionId of subscriptions) {
      const subs = this.byExecution.get(executionId);
      if (subs) {
        subs.delete(connectionId);
        if (subs.size === 0) {
          this.byExecution.delete(executionId);
          orphaned.push(executionId);
        }
      }
    }

    this.byConnection.delete(connectionId);
    this.sockets.delete(connectionId);
    return orphaned;
  }

  broadcast(executionId: string, event: ExecutionEventMessage): void {
    const subscribers = this.byExecution.get(executionId);
    if (!subscribers || subscribers.size === 0) { return; }

    const payload = JSON.stringify(event);
    for (const connectionId of subscribers) {
      const socket = this.sockets.get(connectionId);
      if (socket && socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  get connectionCount(): number {
    return this.byConnection.size;
  }

  get subscriptionCount(): number {
    let total = 0;
    for (const subs of this.byExecution.values()) {
      total += subs.size;
    }
    return total;
  }
}

/** Singleton — shared across Gateway process. */
export const subscriptionRegistry = new SubscriptionRegistry();
