import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEventBus } from '../event-bus.js';

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  it('publish without subscribers is a no-op', async () => {
    await expect(bus.publish('topic.a', { x: 1 })).resolves.toBeUndefined();
  });

  it('delivers events to subscribed handlers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('topic.a', handler);
    await bus.publish('topic.a', { x: 1 });
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it('delivers to multiple handlers in parallel', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('t', h1);
    bus.subscribe('t', h2);
    await bus.publish('t', 'hello');
    expect(h1).toHaveBeenCalledWith('hello');
    expect(h2).toHaveBeenCalledWith('hello');
  });

  it('only delivers to handlers of the matching topic', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('a', h1);
    bus.subscribe('b', h2);
    await bus.publish('a', 1);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).not.toHaveBeenCalled();
  });

  it('isolates handler errors — one throw does not block others', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const ok = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('t', failing);
    bus.subscribe('t', ok);
    await bus.publish('t', 'x');
    expect(ok).toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('unsubscribe removes a single handler', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    const unsub = bus.subscribe('t', h1);
    bus.subscribe('t', h2);
    unsub();
    await bus.publish('t', 1);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('removes the topic when last subscriber unsubscribes', () => {
    const unsub = bus.subscribe('t', async () => {});
    expect(bus.topicCount).toBe(1);
    unsub();
    expect(bus.topicCount).toBe(0);
  });

  it('handlerCount reports total handlers across topics', () => {
    bus.subscribe('a', async () => {});
    bus.subscribe('a', async () => {});
    bus.subscribe('b', async () => {});
    expect(bus.topicCount).toBe(2);
    expect(bus.handlerCount).toBe(3);
  });

  it('clear() removes everything', () => {
    bus.subscribe('a', async () => {});
    bus.subscribe('b', async () => {});
    bus.clear();
    expect(bus.topicCount).toBe(0);
    expect(bus.handlerCount).toBe(0);
  });
});
