/**
 * @module @kb-labs/shared-command-kit/helpers/use-env
 *
 * Sandboxed environment variable access.
 *
 * Reads from runtimeContext (AsyncLocalStorage) when running inside
 * a governed handler execution (worker-pool, subprocess).
 * Falls back to process.env when no runtime context is set
 * (direct CLI, tests, code outside handler).
 *
 * @example
 * ```typescript
 * import { useEnv } from '@kb-labs/sdk';
 *
 * const token = useEnv('NPM_TOKEN');
 * const ci = useEnv('CI');
 * ```
 */

import { runtimeContext } from '@kb-labs/plugin-contracts';

/**
 * Read an environment variable through the sandboxed runtime context.
 *
 * Inside a governed handler: reads through env-shim (permission-checked).
 * Outside handler context: reads process.env directly (backward compat).
 */
export function useEnv(key: string): string | undefined {
  const runtime = runtimeContext.getStore();
  if (runtime?.env) {
    return runtime.env(key);
  }
  return process.env[key];
}
