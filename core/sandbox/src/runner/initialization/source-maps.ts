/**
 * @module @kb-labs/core-sandbox/runner/initialization/source-maps
 * Source map configuration for subprocess execution
 */

export interface SourceMapsOptions {
  enabled?: boolean;
}

/**
 * Setup source maps and extended stack traces
 *
 * CRITICAL: Install BEFORE any other code to ensure all errors have source maps
 *
 * This enables:
 * - Stack traces show src/index.ts:1894 instead of dist/index.js:8923
 * - Extended stack traces (100 frames instead of 10)
 * - Proper error locations in transpiled code
 *
 * TEMPORARILY DISABLED: source-map-support.install() causes OOM during module loading
 * The hookRequire option hooks into module loader and processes source maps for every module,
 * which can cause pathological O(n²) behavior with deep import chains like in mind-engine packages
 */
export function setupSourceMaps(options: SourceMapsOptions = {}): void {
  // Increase stack trace limit from default 10 to 100 for deep traces
  Error.stackTraceLimit = 100;

  // Source map support is disabled for now to prevent OOM
  // TODO: Re-enable when module loading performance is optimized
  if (options.enabled) {
    // Future: import and install source-map-support here
  }
}
