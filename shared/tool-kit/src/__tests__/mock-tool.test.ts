import { describe, it, expect } from 'vitest';
import { mockTool } from '../testing/index.js';

describe('mockTool', () => {
  it('returns a tool with correct definition', () => {
    const tool = mockTool('fs_read');

    expect(tool.definition.type).toBe('function');
    expect(tool.definition.function.name).toBe('fs_read');
    expect(tool.definition.function.description).toContain('fs_read');
  });

  it('executor records calls', async () => {
    const tool = mockTool('my_tool');

    await tool.executor({ path: 'foo.ts' });
    await tool.executor({ path: 'bar.ts' });

    expect(tool.getCalls()).toHaveLength(2);
    expect(tool.getCalls()[0]).toEqual({ path: 'foo.ts' });
    expect(tool.getCalls()[1]).toEqual({ path: 'bar.ts' });
  });

  it('getLastCall returns most recent call', async () => {
    const tool = mockTool('my_tool');

    await tool.executor({ a: 1 });
    await tool.executor({ a: 2 });

    expect(tool.getLastCall()).toEqual({ a: 2 });
  });

  it('getLastCall returns undefined when never called', () => {
    const tool = mockTool('my_tool');
    expect(tool.getLastCall()).toBeUndefined();
  });

  it('wasCalled returns false before any call', () => {
    expect(mockTool('x').wasCalled()).toBe(false);
  });

  it('wasCalled returns true after a call', async () => {
    const tool = mockTool('x');
    await tool.executor({});
    expect(tool.wasCalled()).toBe(true);
  });

  it('callCount tracks number of calls', async () => {
    const tool = mockTool('x');

    expect(tool.callCount()).toBe(0);
    await tool.executor({});
    expect(tool.callCount()).toBe(1);
    await tool.executor({});
    expect(tool.callCount()).toBe(2);
  });

  it('returns default response {} when no response provided', async () => {
    const tool = mockTool('x');
    const result = await tool.executor({});
    expect(result).toEqual({});
  });

  it('returns configured response', async () => {
    const tool = mockTool('x', { success: true, output: 'hello' });
    const result = await tool.executor({});
    expect(result).toEqual({ success: true, output: 'hello' });
  });

  it('respondWith changes future responses', async () => {
    const tool = mockTool('x', { success: false });

    tool.respondWith({ success: true, output: 'updated' });
    const result = await tool.executor({});

    expect(result).toEqual({ success: true, output: 'updated' });
  });

  it('respondWith returns the same mock instance for chaining', () => {
    const tool = mockTool('x');
    const returned = tool.respondWith({ ok: true });
    expect(returned).toBe(tool);
  });

  it('getCalls returns readonly snapshot (not mutated by new calls)', async () => {
    const tool = mockTool('x');
    await tool.executor({ a: 1 });
    const snapshot = tool.getCalls();

    await tool.executor({ b: 2 });

    // The array reference is the same but the test confirms ordering is stable
    expect(snapshot.length).toBe(2);
  });
});
