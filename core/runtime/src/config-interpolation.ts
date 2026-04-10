/**
 * @module @kb-labs/core-runtime/config-interpolation
 *
 * Resolves ${ENV_VAR} placeholders in platform config strings.
 * Applied once at startup — before config is used by loader.ts.
 *
 * Only string values are interpolated. Numbers, booleans, arrays of
 * non-strings are passed through unchanged.
 *
 * Throws if a referenced env var is missing (fail-fast in production).
 * Set required=false per-call to warn instead of throw (dev/test mode).
 */

/**
 * Replace all ${VAR_NAME} patterns in a string with process.env values.
 * Throws if any referenced variable is undefined.
 */
export function interpolateString(value: string, required = true): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const resolved = process.env[varName];
    if (resolved === undefined) {
      if (required) {
        throw new Error(
          `Config interpolation error: environment variable "${varName}" is not set. ` +
          `Found in config value: "${value}"`,
        );
      }
      return match; // leave unresolved in non-required mode
    }
    return resolved;
  });
}

/**
 * Recursively walk an object and interpolate all string values.
 * Non-string primitives and arrays of non-strings are returned as-is.
 *
 * @param value  - Any JSON-compatible value
 * @param required - Whether to throw on missing env vars (default: true)
 */
export function interpolateConfig<T>(value: T, required = true): T {
  if (typeof value === 'string') {
    return interpolateString(value, required) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateConfig(item, required)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateConfig(v, required);
    }
    return result as T;
  }

  // number, boolean, null, undefined — pass through
  return value;
}
