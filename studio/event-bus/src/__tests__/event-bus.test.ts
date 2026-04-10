import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioEventBus } from '../event-bus';

describe('StudioEventBus', () => {
  let bus: StudioEventBus;

  beforeEach(() => {
    bus = new StudioEventBus();
  });

  it('should deliver events to subscribers', () => {
    const handler = vi.fn();
    bus.subscribe('test:event', handler, 'plugin-a', 'page-1');

    bus.publish('test:event', { value: 42 }, 'plugin-b', 'page-2');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      { value: 42 },
      expect.objectContaining({
        sourcePluginId: 'plugin-b',
        sourcePageId: 'page-2',
        timestamp: expect.any(Number),
      }),
    );
  });

  it('should not deliver events to unsubscribed handlers', () => {
    const handler = vi.fn();
    const unsub = bus.subscribe('test:event', handler, 'p', 'page');
    unsub();

    bus.publish('test:event', {}, 'p', 'page');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should unsubscribe all handlers for a page', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    bus.subscribe('event-a', handler1, 'plugin-a', 'page-1');
    bus.subscribe('event-b', handler2, 'plugin-a', 'page-1');
    bus.subscribe('event-a', handler3, 'plugin-b', 'page-2');

    bus.unsubscribeAll('plugin-a', 'page-1');

    bus.publish('event-a', {}, 'x', 'x');
    bus.publish('event-b', {}, 'x', 'x');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
    expect(handler3).toHaveBeenCalledOnce();
  });

  it('should record event history', () => {
    bus.publish('e1', { a: 1 }, 'p1', 'pg1');
    bus.publish('e2', { b: 2 }, 'p2', 'pg2');

    const history = bus.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.event).toBe('e1');
    expect(history[1]!.event).toBe('e2');
  });

  it('should limit history to 100 entries', () => {
    for (let i = 0; i < 150; i++) {
      bus.publish(`event-${i}`, {}, 'p', 'pg');
    }

    expect(bus.getHistory()).toHaveLength(100);
    expect(bus.getHistory()[0]!.event).toBe('event-50');
  });

  it('should not crash if handler throws', () => {
    const badHandler = vi.fn(() => { throw new Error('boom'); });
    const goodHandler = vi.fn();

    bus.subscribe('test', badHandler, 'p', 'pg');
    bus.subscribe('test', goodHandler, 'p', 'pg');

    expect(() => bus.publish('test', {}, 'p', 'pg')).not.toThrow();
    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });

  it('should reset all state', () => {
    bus.subscribe('e', vi.fn(), 'p', 'pg');
    bus.publish('e', {}, 'p', 'pg');

    bus.reset();

    expect(bus.getHistory()).toHaveLength(0);

    const handler = vi.fn();
    bus.subscribe('e', handler, 'p', 'pg');
    // Original subscription should be gone — only new one fires
    bus.publish('e', {}, 'p', 'pg');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should support multiple subscribers for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.subscribe('shared', h1, 'p1', 'pg1');
    bus.subscribe('shared', h2, 'p2', 'pg2');

    bus.publish('shared', { x: 1 }, 'source', 'src-pg');

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should not fire handlers for different event names', () => {
    const handler = vi.fn();
    bus.subscribe('event-a', handler, 'p', 'pg');

    bus.publish('event-b', {}, 'p', 'pg');

    expect(handler).not.toHaveBeenCalled();
  });
});
