import { describe, it, expect } from 'vitest';

import { mergeOverlay } from '../overlay/merge';

describe('mergeOverlay', () => {
  it('replaces scalars from overlay', () => {
    const base = { a: 1, b: 'hello' };
    const out = mergeOverlay(base, { a: 2 });
    expect(out).toEqual({ a: 2, b: 'hello' });
  });

  it('deep-merges plain objects', () => {
    const base = { adapters: { llm: 'openai', cache: 'redis' } };
    const out = mergeOverlay(base, { adapters: { llm: 'anthropic' } });
    expect(out).toEqual({ adapters: { llm: 'anthropic', cache: 'redis' } });
  });

  it('replaces arrays by default', () => {
    const base = { adapters: { llm: ['openai', 'vibeproxy'] } };
    const out = mergeOverlay(base, { adapters: { llm: ['anthropic'] } });
    expect(out).toEqual({ adapters: { llm: ['anthropic'] } });
  });

  it('appends arrays when kb:merge directive is "append"', () => {
    const base = { adapters: { llm: ['openai'] } };
    const out = mergeOverlay(base, {
      adapters: {
        'kb:merge': { llm: 'append' },
        llm: ['vibeproxy'],
      },
    });
    expect(out).toEqual({ adapters: { llm: ['openai', 'vibeproxy'] } });
  });

  it('removes kb:merge directive key from result', () => {
    const out = mergeOverlay(
      { items: [1] },
      { 'kb:merge': { items: 'append' }, items: [2] },
    );
    expect(out).toEqual({ items: [1, 2] });
    expect((out as Record<string, unknown>)['kb:merge']).toBeUndefined();
  });

  it('treats kb:merge with "replace" strategy same as default', () => {
    const out = mergeOverlay(
      { items: [1, 2] },
      { 'kb:merge': { items: 'replace' }, items: [3] },
    );
    expect(out).toEqual({ items: [3] });
  });

  it('throws on unknown kb:merge strategy', () => {
    expect(() =>
      mergeOverlay({ items: [1] }, { 'kb:merge': { items: 'unique' }, items: [2] }),
    ).toThrow(/Invalid kb:merge strategy/);
  });

  it('ignores kb:merge when target is not an array sibling', () => {
    const out = mergeOverlay(
      { foo: { x: 1 } },
      { 'kb:merge': { foo: 'append' }, foo: { y: 2 } },
    );
    expect(out).toEqual({ foo: { x: 1, y: 2 } });
  });

  it('overlay wins on type mismatch (object vs scalar)', () => {
    const out = mergeOverlay({ x: { nested: true } }, { x: 'replaced' });
    expect(out).toEqual({ x: 'replaced' });
  });

  it('does not mutate inputs', () => {
    const base = { a: { b: [1, 2] } };
    const overlay = { a: { b: [3] } };
    const snapshot = JSON.parse(JSON.stringify(base));
    mergeOverlay(base, overlay);
    expect(base).toEqual(snapshot);
  });

  it('handles nested arrays under deep paths', () => {
    const base = { core: { resourceBroker: { llm: { rateLimits: { rps: 5 } } } } };
    const overlay = { core: { resourceBroker: { llm: { rateLimits: { rps: 10, burst: 20 } } } } };
    const out = mergeOverlay(base, overlay);
    expect(out).toEqual({
      core: { resourceBroker: { llm: { rateLimits: { rps: 10, burst: 20 } } } },
    });
  });

  it('handles overlay introducing new keys', () => {
    const out = mergeOverlay({ a: 1 }, { b: 2, c: { d: 3 } });
    expect(out).toEqual({ a: 1, b: 2, c: { d: 3 } });
  });
});
