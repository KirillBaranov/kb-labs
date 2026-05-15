/**
 * @module mock-context
 *
 * Thin wrapper around createTestContext() from @kb-labs/shared-testing.
 *
 * Provides createMockContext() for handler tests: a fully-wired PluginContextV3
 * with vi.fn() spies on runtime, api, platform — no `as unknown as T` casts.
 */

import {
  createTestContext,
  type CreateTestContextOptions,
} from '@kb-labs/shared-testing';
import type { PluginContextV3, UIFacade } from '@kb-labs/plugin-contracts';

export interface MockContextOptions {
  /** Override specific UIFacade methods (merged with default spy UI). */
  ui?: Partial<UIFacade>;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Plugin id for tracing */
  pluginId?: string;
  /**
   * Sync platform mocks to global singleton so that useLLM/useCache
   * composables return the test mocks. Set to false when testing
   * commands that do NOT use composables (avoids singleton contamination).
   * @default false — disabled by default for CLI handler tests
   */
  syncSingleton?: boolean;
}

/**
 * Creates a PluginContextV3 suitable for CLI handler tests.
 *
 * Uses createTestContext() from @kb-labs/shared-testing under the hood —
 * all platform, runtime, and api fields are fully typed vi.fn() spies.
 *
 * Override ui via options to combine with createCapturedUI():
 * ```typescript
 * const { ui, captured } = createCapturedUI();
 * const ctx = createMockContext({ ui });
 * ```
 */
export function createMockContext(opts: MockContextOptions = {}): PluginContextV3 {
  const ctxOptions: CreateTestContextOptions = {
    host: 'cli',
    pluginId: opts.pluginId,
    cwd: opts.cwd,
    ui: opts.ui,
    // Disabled by default: CLI handler tests typically don't use composables
    // and disabling avoids cross-test singleton contamination.
    syncSingleton: opts.syncSingleton ?? false,
  };

  const { ctx } = createTestContext(ctxOptions);
  return ctx;
}
