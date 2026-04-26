/**
 * @module @kb-labs/plugin-contracts/platform-context
 *
 * AsyncLocalStorage-based platform context for plugin execution.
 *
 * Replaces the global singleton pattern for platform access.
 * Each handler execution gets its own platform instance (with correct proxy adapters,
 * permissions, and tracing context) via AsyncLocalStorage.
 *
 * ## Usage
 *
 * **Setting context (in plugin-runtime runInProcess):**
 * ```typescript
 * import { platformContext } from '@kb-labs/plugin-contracts';
 * platformContext.run(governedPlatform, () => handler.execute(ctx, input));
 * ```
 *
 * **Reading context (in hooks like usePlatform):**
 * ```typescript
 * import { platformContext } from '@kb-labs/plugin-contracts';
 * const platform = platformContext.getStore(); // PlatformServices | undefined
 * ```
 *
 * ## Why AsyncLocalStorage
 *
 * See ADR-0054 for full rationale. Summary:
 * - Global singleton breaks in worker-pool (process has no initPlatform)
 * - Global singleton can't support per-plugin permissions in parallel in-process execution
 * - AsyncLocalStorage propagates through async/await automatically
 * - Zero overhead for sync code, ~2-5ns for getStore()
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { PlatformServices } from './platform.js';

/**
 * Process-global key for the AsyncLocalStorage instance.
 * Using Symbol.for() ensures the SAME instance is shared across all bundles
 * in the same process — even if plugin-contracts is bundled into multiple packages
 * (e.g., plugin-runtime bundles it via noExternal, shared-command-kit imports externally).
 */
const PLATFORM_CONTEXT_KEY = Symbol.for('kb.platformContext');

/**
 * Get or create the singleton AsyncLocalStorage instance.
 * Stored on process global to survive bundler duplication.
 */
function getOrCreatePlatformContext(): AsyncLocalStorage<PlatformServices> {
  const proc = process as NodeJS.Process & Record<symbol, unknown>;
  const existing = proc[PLATFORM_CONTEXT_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing;
  }
  const ctx = new AsyncLocalStorage<PlatformServices>();
  proc[PLATFORM_CONTEXT_KEY] = ctx;
  return ctx;
}

/**
 * AsyncLocalStorage instance for platform context propagation.
 *
 * - `runInProcess()` calls `platformContext.run(platform, fn)` before handler execution
 * - `usePlatform()` calls `platformContext.getStore()` to get the current platform
 * - Falls back to global singleton if no context is set (backward compat)
 *
 * Uses process-level Symbol.for() storage to ensure singleton identity
 * across bundled copies of this module.
 */
export const platformContext: AsyncLocalStorage<PlatformServices> = getOrCreatePlatformContext();
