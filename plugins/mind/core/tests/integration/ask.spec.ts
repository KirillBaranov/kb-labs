import { describe, it, expect, beforeEach } from 'vitest';
import { AgentResponseSchema, resolveMindConfig } from '@kb-labs/mind-contracts';
import { createMind, type Mind } from '../../src/index';
import { makeTestServices, makeScriptedLLM, type TestServices } from '../../src/testing';

describe('mind.ask — agent answers (frozen agent-response-v1)', () => {
  let services: TestServices;

  beforeEach(async () => {
    services = makeTestServices();
    services.storage.seed(
      'src/auth.ts',
      'export function login(user, password) { return authenticate(user, password); }',
    );
    services.storage.seed('src/cart.ts', 'export function addToCart(item) { cart.push(item); }');
  });

  async function indexed(mind: Mind): Promise<Mind> {
    await mind.index({ indexId: 'code', scope: 'src/' });
    return mind;
  }

  it('returns a contract-valid response in instant mode (no LLM)', async () => {
    const mind = await indexed(createMind(services, resolveMindConfig({}), { now: () => 1000 }));
    const res = await mind.ask({ text: 'login authenticate user', indexId: 'code', mode: 'instant' });

    expect(() => AgentResponseSchema.parse(res)).not.toThrow();
    expect(res.meta.schemaVersion).toBe('agent-response-v1');
    expect(res.meta.mode).toBe('instant');
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources[0]?.file).toBe('src/auth.ts');
    expect(res.answer.length).toBeGreaterThan(0);
  });

  it('uses the LLM answer in auto mode when available', async () => {
    const llm = makeScriptedLLM('Login is handled by login() in src/auth.ts.');
    const mind = await indexed(createMind(makeServicesWithLLM(services, llm), resolveMindConfig({}), { now: () => 1000 }));
    const res = await mind.ask({ text: 'how does login work', indexId: 'code', mode: 'auto' });

    expect(res.answer).toContain('login()');
    expect(res.meta.mode).toBe('auto');
    expect(typeof res.complete).toBe('boolean');
    expect(res.sources.length).toBeGreaterThan(0);
  });

  it('abstains gracefully on an empty index (low confidence, no sources)', async () => {
    const mind = createMind(services, resolveMindConfig({}), { now: () => 1000 });
    const res = await mind.ask({ text: 'anything', indexId: 'empty', mode: 'instant' });

    expect(() => AgentResponseSchema.parse(res)).not.toThrow();
    expect(res.sources).toEqual([]);
    expect(res.complete).toBe(false);
  });

  it('records the query in feedback history', async () => {
    const recorded: Array<[string, number, string]> = [];
    const cache = {
      async zadd(key: string, score: number, member: string) {
        recorded.push([key, score, member]);
      },
      async zrangebyscore() {
        return [];
      },
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
    } as unknown as TestServices['cache'];

    const mind = await indexed(
      createMind({ ...services, cache }, resolveMindConfig({}), { now: () => 4242 }),
    );
    await mind.ask({ text: 'login', indexId: 'code', mode: 'instant' });
    expect(recorded.some(([, , member]) => member === 'login')).toBe(true);
  });
});

// Helper: clone services with a specific LLM.
function makeServicesWithLLM(base: TestServices, llm: TestServices['llm']): TestServices {
  return { ...base, llm } as TestServices;
}
