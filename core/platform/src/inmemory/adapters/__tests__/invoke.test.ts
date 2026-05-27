import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryInvoke } from '../invoke.js';

describe('InMemoryInvoke', () => {
  let invoke: InMemoryInvoke;

  beforeEach(() => {
    invoke = new InMemoryInvoke();
  });

  it('call returns success:false when no handler is registered', async () => {
    const res = await invoke.call({ pluginId: 'x', command: 'y', input: {} });
    expect(res.success).toBe(false);
    expect(res.success === false && res.error).toMatch(/No handler/);
  });

  it('dispatches to a registered handler and returns data + durationMs', async () => {
    invoke.register('p', 'add', (input) => {
      const { a, b } = input as { a: number; b: number };
      return a + b;
    });
    const res = await invoke.call({ pluginId: 'p', command: 'add', input: { a: 2, b: 3 } });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toBe(5);
      expect(res.metadata?.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('captures synchronous return values from non-async handlers', async () => {
    invoke.register('p', 'sync', () => 'hello');
    const res = await invoke.call({ pluginId: 'p', command: 'sync', input: null });
    expect(res.success && res.data).toBe('hello');
  });

  it('turns thrown Errors into success:false responses', async () => {
    invoke.register('p', 'boom', () => {
      throw new Error('explode');
    });
    const res = await invoke.call({ pluginId: 'p', command: 'boom', input: {} });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe('explode');
      expect(res.metadata?.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('stringifies non-Error throws', async () => {
    invoke.register('p', 'str', () => {
      throw 'string-fail';
    });
    const res = await invoke.call({ pluginId: 'p', command: 'str', input: {} });
    expect(!res.success && res.error).toBe('string-fail');
  });

  it('unregister removes a handler', async () => {
    invoke.register('p', 'cmd', () => 'ok');
    invoke.unregister('p', 'cmd');
    const res = await invoke.call({ pluginId: 'p', command: 'cmd', input: {} });
    expect(res.success).toBe(false);
  });

  it('isAvailable checks specific command', async () => {
    invoke.register('p', 'cmd', () => 1);
    expect(await invoke.isAvailable('p', 'cmd')).toBe(true);
    expect(await invoke.isAvailable('p', 'other')).toBe(false);
  });

  it('isAvailable without command checks if any command exists for plugin', async () => {
    expect(await invoke.isAvailable('p')).toBe(false);
    invoke.register('p', 'a', () => 0);
    expect(await invoke.isAvailable('p')).toBe(true);
    expect(await invoke.isAvailable('other')).toBe(false);
  });
});
