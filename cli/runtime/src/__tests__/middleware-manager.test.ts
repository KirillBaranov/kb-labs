import { describe, it, expect } from 'vitest';
import { MiddlewareManager, type MiddlewareConfig } from '../middleware/middleware-manager.js';

function createManager() {
  return new MiddlewareManager({
    lifecycleTimeoutMs: 5_000,
    middlewareTimeoutMs: 2_000,
    discoveryTimeoutMs: 10_000,
  });
}

describe('MiddlewareManager', () => {
  // ── register & ordering ──────────────────────────────────────────────

  it('executes middlewares in priority order (lower runs first)', async () => {
    const manager = createManager();
    const order: string[] = [];

    manager.register({
      name: 'second',
      priority: 20,
      middleware: async (_ctx, next) => { order.push('second'); return next(); },
    });
    manager.register({
      name: 'first',
      priority: 10,
      middleware: async (_ctx, next) => { order.push('first'); return next(); },
    });
    manager.register({
      name: 'third',
      priority: 30,
      middleware: async (_ctx, next) => { order.push('third'); return next(); },
    });

    await manager.execute({}, async () => { order.push('handler'); return 'done'; });

    expect(order).toEqual(['first', 'second', 'third', 'handler']);
  });

  it('maintains order when priorities are equal (insertion order)', async () => {
    const manager = createManager();
    const order: string[] = [];

    manager.register({
      name: 'a',
      priority: 10,
      middleware: async (_ctx, next) => { order.push('a'); return next(); },
    });
    manager.register({
      name: 'b',
      priority: 10,
      middleware: async (_ctx, next) => { order.push('b'); return next(); },
    });

    await manager.execute({}, async () => { order.push('handler'); return 'done'; });

    expect(order).toEqual(['a', 'b', 'handler']);
  });

  // ── execute ──────────────────────────────────────────────────────────

  it('runs handler directly when no middlewares registered', async () => {
    const manager = createManager();
    const result = await manager.execute({}, async () => 42);
    expect(result).toBe(42);
  });

  it('passes context to each middleware', async () => {
    const manager = createManager();
    const ctx = { requestId: 'test-123' };
    const seen: unknown[] = [];

    manager.register({
      name: 'spy',
      priority: 1,
      middleware: async (c, next) => { seen.push(c); return next(); },
    });

    await manager.execute(ctx, async () => 'ok');

    expect(seen).toEqual([ctx]);
  });

  it('returns handler result through the chain', async () => {
    const manager = createManager();

    manager.register({
      name: 'passthrough',
      priority: 1,
      middleware: async (_ctx, next) => next(),
    });

    const result = await manager.execute({}, async () => ({ data: [1, 2, 3] }));
    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it('allows middleware to transform the result', async () => {
    const manager = createManager();

    manager.register({
      name: 'doubler',
      priority: 1,
      middleware: async (_ctx, next) => {
        const result = await next();
        return (result as number) * 2;
      },
    });

    const result = await manager.execute({}, async () => 21);
    expect(result).toBe(42);
  });

  it('allows middleware to short-circuit (skip handler)', async () => {
    const manager = createManager();
    let handlerCalled = false;

    manager.register({
      name: 'blocker',
      priority: 1,
      middleware: async (_ctx, _next) => 'blocked',
    });

    const result = await manager.execute({}, async () => {
      handlerCalled = true;
      return 'from-handler';
    });

    expect(result).toBe('blocked');
    expect(handlerCalled).toBe(false);
  });

  // ── error propagation ────────────────────────────────────────────────

  it('propagates handler errors through the chain', async () => {
    const manager = createManager();

    manager.register({
      name: 'passthrough',
      priority: 1,
      middleware: async (_ctx, next) => next(),
    });

    await expect(
      manager.execute({}, async () => { throw new Error('handler-boom'); }),
    ).rejects.toThrow('handler-boom');
  });

  it('propagates middleware errors', async () => {
    const manager = createManager();

    manager.register({
      name: 'faulty',
      priority: 1,
      middleware: async () => { throw new Error('middleware-boom'); },
    });

    await expect(
      manager.execute({}, async () => 'ok'),
    ).rejects.toThrow('middleware-boom');
  });

  it('allows middleware to catch and handle errors', async () => {
    const manager = createManager();

    manager.register({
      name: 'error-handler',
      priority: 1,
      middleware: async (_ctx, next) => {
        try {
          return await next();
        } catch {
          return 'recovered';
        }
      },
    });

    const result = await manager.execute({}, async () => { throw new Error('fail'); });
    expect(result).toBe('recovered');
  });

  // ── buildChain ───────────────────────────────────────────────────────

  it('buildChain returns ordered middleware functions', () => {
    const manager = createManager();
    const mw1: MiddlewareConfig = {
      name: 'a',
      priority: 20,
      middleware: async (_ctx, next) => next(),
    };
    const mw2: MiddlewareConfig = {
      name: 'b',
      priority: 10,
      middleware: async (_ctx, next) => next(),
    };

    manager.register(mw1);
    manager.register(mw2);

    const chain = manager.buildChain();
    expect(chain).toHaveLength(2);
    // b (priority 10) should come first
    expect(chain[0]).toBe(mw2.middleware);
    expect(chain[1]).toBe(mw1.middleware);
  });

  it('buildChain returns empty array when no middlewares', () => {
    const manager = createManager();
    expect(manager.buildChain()).toEqual([]);
  });

  // ── nested middleware interaction ────────────────────────────────────

  it('supports wrapping pattern (before/after handler)', async () => {
    const manager = createManager();
    const log: string[] = [];

    manager.register({
      name: 'timer',
      priority: 1,
      middleware: async (_ctx, next) => {
        log.push('before');
        const result = await next();
        log.push('after');
        return result;
      },
    });

    await manager.execute({}, async () => { log.push('handler'); return 'ok'; });

    expect(log).toEqual(['before', 'handler', 'after']);
  });

  it('supports multiple wrapping middlewares (onion model)', async () => {
    const manager = createManager();
    const log: string[] = [];

    manager.register({
      name: 'outer',
      priority: 1,
      middleware: async (_ctx, next) => {
        log.push('outer-before');
        const result = await next();
        log.push('outer-after');
        return result;
      },
    });

    manager.register({
      name: 'inner',
      priority: 2,
      middleware: async (_ctx, next) => {
        log.push('inner-before');
        const result = await next();
        log.push('inner-after');
        return result;
      },
    });

    await manager.execute({}, async () => { log.push('handler'); return 'ok'; });

    expect(log).toEqual([
      'outer-before',
      'inner-before',
      'handler',
      'inner-after',
      'outer-after',
    ]);
  });
});
