import { describe, it, expect } from 'vitest';
import { InMemoryConfig } from '../config.js';

describe('InMemoryConfig', () => {
  it('default constructor exposes an empty raw bag', async () => {
    const cfg = new InMemoryConfig();
    expect(await cfg.getRawConfig()).toEqual({});
    expect(await cfg.getConfig('any')).toBeUndefined();
  });

  it('returns the product slice when seeded', async () => {
    const cfg = new InMemoryConfig({ gateway: { port: 4000 }, mind: { topK: 5 } });
    expect(await cfg.getConfig('gateway')).toEqual({ port: 4000 });
    expect(await cfg.getConfig('mind')).toEqual({ topK: 5 });
    expect(await cfg.getConfig('missing')).toBeUndefined();
  });

  it('ignores profileId (no-op argument)', async () => {
    const cfg = new InMemoryConfig({ p: { v: 1 } });
    expect(await cfg.getConfig('p', 'prod')).toEqual({ v: 1 });
    expect(await cfg.getConfig('p', 'dev')).toEqual({ v: 1 });
  });

  it('getRawConfig returns the entire bag', async () => {
    const bag = { a: 1, b: 2 };
    const cfg = new InMemoryConfig(bag);
    expect(await cfg.getRawConfig()).toEqual(bag);
  });
});
