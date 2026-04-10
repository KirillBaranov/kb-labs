/**
 * Global context holder for sandbox proxying
 *
 * Lives in subprocess scope - isolated per plugin execution.
 * Allows monkey-patched require() to access ctx.runtime.* for proxying.
 *
 * Security note: This is safe because:
 * 1. Each plugin runs in isolated subprocess
 * 2. Context is cleared after execution
 * 3. No cross-plugin contamination possible
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

/**
 * Global context singleton (subprocess-scoped)
 */
let globalContext: PluginContextV3 | null = null;

/**
 * Set global context for sandbox proxying
 *
 * Called from bootstrap.ts after context creation.
 */
export function setGlobalContext(ctx: PluginContextV3): void {
  globalContext = ctx;
}

/**
 * Get global context (for use in monkey-patched require)
 *
 * Returns null if context not yet initialized.
 */
export function getGlobalContext(): PluginContextV3 | null {
  return globalContext;
}

/**
 * Clear global context after plugin execution
 *
 * Called from bootstrap.ts cleanup.
 */
export function clearGlobalContext(): void {
  globalContext = null;
}
