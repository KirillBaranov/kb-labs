/**
 * Unit tests for SubscriptionRegistry (CC5 — Multi-Client Pub/Sub).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionRegistry } from '../clients/subscription-registry.js';
import type { ExecutionEventMessage } from '@kb-labs/gateway-contracts';

// Minimal WebSocket mock with configurable readyState
function makeSocket(readyState = 1 /* OPEN */) {
  return {
    readyState,
    OPEN: 1,
    send: vi.fn(),
  };
}

let registry: SubscriptionRegistry;

beforeEach(() => {
  registry = new SubscriptionRegistry();
});

// ── subscribe / unsubscribe ────────────────────────────────────────────────────

describe('SubscriptionRegistry — subscribe / unsubscribe', () => {
  it('subscribe adds to both indexes', () => {
    registry.subscribe('conn-1', 'exec-1');
    expect(registry.getSubscribers('exec-1').has('conn-1')).toBe(true);
    expect(registry.getSubscriptions('conn-1').has('exec-1')).toBe(true);
  });

  it('multiple connections can subscribe to same execution', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-2', 'exec-1');
    const subs = registry.getSubscribers('exec-1');
    expect(subs.has('conn-1')).toBe(true);
    expect(subs.has('conn-2')).toBe(true);
    expect(subs.size).toBe(2);
  });

  it('one connection can subscribe to multiple executions', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-1', 'exec-2');
    const subs = registry.getSubscriptions('conn-1');
    expect(subs.has('exec-1')).toBe(true);
    expect(subs.has('exec-2')).toBe(true);
    expect(subs.size).toBe(2);
  });

  it('subscribe is idempotent', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-1', 'exec-1');
    expect(registry.getSubscribers('exec-1').size).toBe(1);
    expect(registry.getSubscriptions('conn-1').size).toBe(1);
  });

  it('unsubscribe removes from both indexes', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.unsubscribe('conn-1', 'exec-1');
    expect(registry.getSubscribers('exec-1').has('conn-1')).toBe(false);
    expect(registry.getSubscriptions('conn-1').has('exec-1')).toBe(false);
  });

  it('unsubscribe GCs empty sets', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.unsubscribe('conn-1', 'exec-1');
    // getSubscribers returns an empty set (not the internal one), but size should be 0
    expect(registry.getSubscribers('exec-1').size).toBe(0);
    expect(registry.getSubscriptions('conn-1').size).toBe(0);
    // connectionCount and subscriptionCount reflect no data
    expect(registry.connectionCount).toBe(0);
    expect(registry.subscriptionCount).toBe(0);
  });

  it('unsubscribe only removes one connection, other subscribers remain', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-2', 'exec-1');
    registry.unsubscribe('conn-1', 'exec-1');
    const subs = registry.getSubscribers('exec-1');
    expect(subs.has('conn-1')).toBe(false);
    expect(subs.has('conn-2')).toBe(true);
  });

  it('unsubscribe on non-existent connection/execution does not throw', () => {
    expect(() => registry.unsubscribe('ghost', 'exec-1')).not.toThrow();
    expect(() => registry.unsubscribe('conn-1', 'ghost')).not.toThrow();
  });
});

// ── registerSocket / removeSocket ─────────────────────────────────────────────

describe('SubscriptionRegistry — registerSocket / removeSocket', () => {
  it('registerSocket stores socket for broadcast', () => {
    const socket = makeSocket();
    registry.registerSocket('conn-1', socket as never);
    registry.subscribe('conn-1', 'exec-1');

    const event: ExecutionEventMessage = {
      type: 'execution:output',
      requestId: 'req-1',
      executionId: 'exec-1',
      stream: 'stdout',
      data: 'hello',
      timestamp: Date.now(),
    };
    registry.broadcast('exec-1', event);
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('removeSocket prevents broadcast after removal', () => {
    const socket = makeSocket();
    registry.registerSocket('conn-1', socket as never);
    registry.subscribe('conn-1', 'exec-1');
    registry.removeSocket('conn-1');

    const event: ExecutionEventMessage = {
      type: 'execution:output',
      requestId: 'req-1',
      executionId: 'exec-1',
      stream: 'stdout',
      data: 'hello',
      timestamp: Date.now(),
    };
    registry.broadcast('exec-1', event);
    expect(socket.send).not.toHaveBeenCalled();
  });
});

// ── broadcast ─────────────────────────────────────────────────────────────────

describe('SubscriptionRegistry — broadcast', () => {
  const makeEvent = (executionId: string): ExecutionEventMessage => ({
    type: 'execution:output',
    requestId: 'req-broadcast',
    executionId,
    stream: 'stdout',
    data: 'output data',
    timestamp: Date.now(),
  });

  it('broadcasts to all open subscribers', () => {
    const s1 = makeSocket();
    const s2 = makeSocket();
    registry.registerSocket('conn-1', s1 as never);
    registry.registerSocket('conn-2', s2 as never);
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-2', 'exec-1');

    registry.broadcast('exec-1', makeEvent('exec-1'));
    expect(s1.send).toHaveBeenCalledTimes(1);
    expect(s2.send).toHaveBeenCalledTimes(1);
  });

  it('does not broadcast to closed sockets', () => {
    const open = makeSocket(1); // OPEN
    const closed = makeSocket(3); // CLOSED
    registry.registerSocket('conn-open', open as never);
    registry.registerSocket('conn-closed', closed as never);
    registry.subscribe('conn-open', 'exec-1');
    registry.subscribe('conn-closed', 'exec-1');

    registry.broadcast('exec-1', makeEvent('exec-1'));
    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('does not broadcast to connections without a registered socket', () => {
    registry.subscribe('conn-no-socket', 'exec-1');
    // Should not throw
    expect(() => registry.broadcast('exec-1', makeEvent('exec-1'))).not.toThrow();
  });

  it('broadcast sends JSON-serialised event', () => {
    const socket = makeSocket();
    registry.registerSocket('conn-1', socket as never);
    registry.subscribe('conn-1', 'exec-1');

    const event = makeEvent('exec-1');
    registry.broadcast('exec-1', event);

    const sent = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string) as unknown;
    expect(sent).toEqual(event);
  });

  it('broadcast to execution with no subscribers is a no-op', () => {
    // Should not throw
    expect(() => registry.broadcast('no-subscribers', makeEvent('no-subscribers'))).not.toThrow();
  });

  it('broadcast only reaches subscribers of the target execution', () => {
    const s1 = makeSocket();
    const s2 = makeSocket();
    registry.registerSocket('conn-1', s1 as never);
    registry.registerSocket('conn-2', s2 as never);
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-2', 'exec-2'); // different execution

    registry.broadcast('exec-1', makeEvent('exec-1'));
    expect(s1.send).toHaveBeenCalledTimes(1);
    expect(s2.send).not.toHaveBeenCalled(); // unrelated subscriber
  });
});

// ── removeConnection ──────────────────────────────────────────────────────────

describe('SubscriptionRegistry — removeConnection', () => {
  it('returns orphaned executionIds (those with zero subscribers after removal)', () => {
    registry.subscribe('conn-1', 'exec-orphan');
    const orphaned = registry.removeConnection('conn-1');
    expect(orphaned).toContain('exec-orphan');
  });

  it('does not return executionId still subscribed by another connection', () => {
    registry.subscribe('conn-1', 'exec-shared');
    registry.subscribe('conn-2', 'exec-shared');
    const orphaned = registry.removeConnection('conn-1');
    expect(orphaned).not.toContain('exec-shared');
  });

  it('returns empty array if connection had no subscriptions', () => {
    const orphaned = registry.removeConnection('ghost-conn');
    expect(orphaned).toEqual([]);
  });

  it('cleans up all indexes for removed connection', () => {
    const socket = makeSocket();
    registry.registerSocket('conn-1', socket as never);
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-1', 'exec-2');

    registry.removeConnection('conn-1');

    expect(registry.connectionCount).toBe(0);
    expect(registry.getSubscriptions('conn-1').size).toBe(0);
    expect(registry.getSubscribers('exec-1').size).toBe(0);
    expect(registry.getSubscribers('exec-2').size).toBe(0);
  });

  it('removes socket during removeConnection', () => {
    const socket = makeSocket();
    registry.registerSocket('conn-1', socket as never);
    registry.subscribe('conn-1', 'exec-1');
    registry.removeConnection('conn-1');

    // Broadcast should not reach the removed socket
    const event: ExecutionEventMessage = {
      type: 'execution:output',
      requestId: 'req-late',
      executionId: 'exec-1',
      stream: 'stdout',
      data: 'late',
      timestamp: Date.now(),
    };
    // exec-1 was orphaned and removed, but even if called directly it should not throw
    registry.broadcast('exec-1', event);
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('returns orphaned list with multiple executions', () => {
    registry.subscribe('conn-1', 'exec-a');
    registry.subscribe('conn-1', 'exec-b');
    // conn-2 also subscribes to exec-b → exec-b won't be orphaned
    registry.subscribe('conn-2', 'exec-b');

    const orphaned = registry.removeConnection('conn-1');
    expect(orphaned).toContain('exec-a');
    expect(orphaned).not.toContain('exec-b');
  });
});

// ── connectionCount / subscriptionCount ───────────────────────────────────────

describe('SubscriptionRegistry — metrics', () => {
  it('connectionCount tracks unique connections with subscriptions', () => {
    expect(registry.connectionCount).toBe(0);
    registry.subscribe('conn-1', 'exec-1');
    expect(registry.connectionCount).toBe(1);
    registry.subscribe('conn-2', 'exec-1');
    expect(registry.connectionCount).toBe(2);
  });

  it('subscriptionCount is the sum of all (connection, execution) pairs', () => {
    expect(registry.subscriptionCount).toBe(0);
    registry.subscribe('conn-1', 'exec-1');
    expect(registry.subscriptionCount).toBe(1);
    registry.subscribe('conn-1', 'exec-2');
    expect(registry.subscriptionCount).toBe(2);
    registry.subscribe('conn-2', 'exec-1');
    expect(registry.subscriptionCount).toBe(3);
  });

  it('counts decrease after unsubscribe', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-1', 'exec-2');
    registry.unsubscribe('conn-1', 'exec-1');
    expect(registry.subscriptionCount).toBe(1);
    expect(registry.connectionCount).toBe(1);
  });

  it('counts reset to 0 after all connections removed', () => {
    registry.subscribe('conn-1', 'exec-1');
    registry.subscribe('conn-2', 'exec-1');
    registry.removeConnection('conn-1');
    registry.removeConnection('conn-2');
    expect(registry.connectionCount).toBe(0);
    expect(registry.subscriptionCount).toBe(0);
  });
});
