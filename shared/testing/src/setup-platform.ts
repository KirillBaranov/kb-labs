/**
 * @module @kb-labs/shared-testing/setup-platform
 *
 * Solves the "singleton gap" problem: composables (useLLM, useCache, etc.)
 * read from the global platform singleton, but createTestContext() only
 * populates ctx.platform. This module bridges the gap by setting test mocks
 * directly into the global singleton.
 */

import { platform, resetPlatform } from '@kb-labs/core-runtime';
import type {
  ILLM,
  ICache,
  IEmbeddings,
  IVectorStore,
  IStorage,
  IAnalytics,
  ILogger,
  IEventBus,
} from '@kb-labs/core-platform';

/**
 * Options for setting up the test platform.
 * Only adapters that are provided will be registered.
 * Omitted adapters will use the PlatformContainer's built-in fallbacks.
 */
export interface TestPlatformOptions {
  llm?: ILLM;
  cache?: ICache;
  embeddings?: IEmbeddings;
  vectorStore?: IVectorStore;
  storage?: IStorage;
  analytics?: IAnalytics;
  logger?: ILogger;
  eventBus?: IEventBus;
}

export interface TestPlatformResult {
  /** The global platform singleton (with test mocks applied) */
  platform: typeof platform;
  /** Call in afterEach() to reset the singleton to a clean state */
  cleanup: () => void;
}

/**
 * Setup the global platform singleton with test mocks.
 *
 * This ensures that useLLM(), useCache() and other composables
 * return the test mocks instead of uninitialized/stale adapters.
 *
 * @example
 * ```typescript
 * import { setupTestPlatform, mockLLM } from '@kb-labs/shared-testing';
 *
 * describe('my handler', () => {
 *   let cleanup: () => void;
 *
 *   beforeEach(() => {
 *     const result = setupTestPlatform({
 *       llm: mockLLM().onAnyComplete().respondWith('hello'),
 *     });
 *     cleanup = result.cleanup;
 *   });
 *
 *   afterEach(() => cleanup());
 *
 *   it('uses LLM', async () => {
 *     const llm = useLLM(); // Returns the test mock!
 *     const res = await llm!.complete('test');
 *     expect(res.content).toBe('hello');
 *   });
 * });
 * ```
 */
export function setupTestPlatform(options: TestPlatformOptions = {}): TestPlatformResult {
  // Reset everything first — clean slate
  resetPlatform();

  // Register provided adapters into the global singleton
  const adapterMap: Array<[string, unknown]> = [
    ['llm', options.llm],
    ['cache', options.cache],
    ['embeddings', options.embeddings],
    ['vectorStore', options.vectorStore],
    ['storage', options.storage],
    ['analytics', options.analytics],
    ['logger', options.logger],
    ['eventBus', options.eventBus],
  ];

  for (const [key, instance] of adapterMap) {
    if (instance !== undefined) {
      platform.setAdapter(key, instance);
    }
  }

  return {
    platform,
    cleanup: () => resetPlatform(),
  };
}
