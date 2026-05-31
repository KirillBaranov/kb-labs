import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestPlatform, mockCLIInput } from '@kb-labs/sdk/testing';
import { TestVectorStore, TestStorage, DeterministicEmbedder } from '@kb-labs/mind-core/testing';
import type { PluginContextV3 } from '@kb-labs/sdk';
import indexCmd from '../../src/cli/commands/index.js';
import searchCmd from '../../src/cli/commands/search.js';
import searchHandler from '../../src/rest/handlers/search.js';

/**
 * Proves the parity invariant: the CLI command and the REST handler call the
 * same engine (via buildMind) and produce identical results. We install
 * functional in-memory adapters into the platform singleton so the real
 * buildMind path runs end-to-end — no mocking of the engine.
 */
describe('CLI ↔ REST parity (search)', () => {
  let cleanup: () => void;
  // Minimal captured-UI context; cast is test-only.
  let jsonCalls: unknown[];
  let ctx: PluginContextV3;

  beforeEach(() => {
    const storage = new TestStorage();
    storage.seed(
      'src/auth.ts',
      'export function login(user, password) { return authenticate(user, password); }',
    );
    storage.seed('src/cart.ts', 'export function addToCart(item) { cart.push(item); }');

    const result = setupTestPlatform({
      vectorStore: new TestVectorStore(),
      storage,
      embeddings: new DeterministicEmbedder(),
    });
    cleanup = result.cleanup;

    jsonCalls = [];
    ctx = {
      host: 'cli',
      ui: {
        json: (d: unknown) => jsonCalls.push(d),
        success: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
      },
      cwd: process.cwd(),
    } as unknown as PluginContextV3;
  });

  afterEach(() => cleanup());

  it('CLI search --json equals REST search response', async () => {
    await indexCmd.execute(ctx, mockCLIInput({ flags: { index: 'code', scope: 'src/' } }));

    await searchCmd.execute(
      ctx,
      mockCLIInput({ flags: { text: 'login authenticate user', index: 'code', json: true } }),
    );
    const cliResult = jsonCalls[jsonCalls.length - 1];

    const restResult = await searchHandler.execute(
      ctx,
      { body: { text: 'login authenticate user', indexId: 'code' } } as never,
    );

    // `trace` is observability (timings/requestId) and inherently varies between
    // two calls; parity is about the result payload (results/confidence/indexId).
    const strip = (r: unknown) => {
      const { trace: _trace, ...rest } = r as Record<string, unknown>;
      return rest;
    };
    expect(strip(cliResult)).toEqual(strip(restResult));
    expect((restResult as { results: Array<{ file: string }> }).results[0]?.file).toBe('src/auth.ts');
  });
});
