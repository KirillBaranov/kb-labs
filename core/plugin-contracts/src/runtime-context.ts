/**
 * @module @kb-labs/plugin-contracts/runtime-context
 *
 * AsyncLocalStorage-based runtime context for sandboxed execution.
 *
 * Stores RuntimeAPI (env, fs, fetch shims) per handler execution.
 * Works in tandem with platformContext — platform provides adapters,
 * runtime provides sandboxed system access governed by permissions.
 *
 * ## Usage
 *
 * **Setting context (in plugin-runtime runner):**
 * ```typescript
 * import { runtimeContext } from '@kb-labs/plugin-contracts';
 * runtimeContext.run(runtimeAPI, () => handler.execute(ctx, input));
 * ```
 *
 * **Reading context (in hooks like useEnv):**
 * ```typescript
 * import { runtimeContext } from '@kb-labs/plugin-contracts';
 * const runtime = runtimeContext.getStore();
 * const token = runtime?.env('NPM_TOKEN');
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { RuntimeAPI } from './runtime.js';

const RUNTIME_CONTEXT_KEY = Symbol.for('kb.runtimeContext');

function getOrCreateRuntimeContext(): AsyncLocalStorage<RuntimeAPI> {
  const proc = process as NodeJS.Process & Record<symbol, unknown>;
  const existing = proc[RUNTIME_CONTEXT_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing;
  }
  const ctx = new AsyncLocalStorage<RuntimeAPI>();
  proc[RUNTIME_CONTEXT_KEY] = ctx;
  return ctx;
}

/**
 * AsyncLocalStorage instance for runtime context propagation.
 *
 * - Runner sets context before handler execution
 * - useEnv() / useFS() / useFetch() read from it
 * - Falls back to process.env / native fs / native fetch if no context
 */
export const runtimeContext: AsyncLocalStorage<RuntimeAPI> = getOrCreateRuntimeContext();
