/**
 * @module @kb-labs/shared-command-kit/helpers/flags
 * Helper functions for working with command flags (optional utilities)
 * 
 * These functions are completely optional - you can access flags directly.
 * They are provided for convenience when you need type-safe flag access.
 */

/**
 * Get a flag value with type safety
 * 
 * @example
 * ```typescript
 * const name = getFlag<string>(flags, 'name'); // string | undefined
 * const count = getFlag<number>(flags, 'count', 0); // number (with default)
 * ```
 */
export function getFlag<T>(
  flags: Record<string, unknown>,
  name: string,
  defaultValue?: T
): T | undefined {
  const value = flags[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value as T;
}

/**
 * Require a flag value (throws if missing)
 * 
 * @example
 * ```typescript
 * const name = requireFlag<string>(flags, 'name'); // string (throws if missing)
 * ```
 */
export function requireFlag<T>(
  flags: Record<string, unknown>,
  name: string
): T {
  const value = flags[name];
  if (value === undefined) {
    throw new Error(`Required flag '${name}' is missing`);
  }
  return value as T;
}

/**
 * Check if a flag is present
 * 
 * @example
 * ```typescript
 * if (hasFlag(flags, 'dry-run')) {
 *   // Flag is present
 * }
 * ```
 */
export function hasFlag(
  flags: Record<string, unknown>,
  name: string
): boolean {
  return flags[name] !== undefined;
}

/**
 * Get multiple flags at once
 * 
 * @example
 * ```typescript
 * const { name, count } = getFlags(flags, ['name', 'count']);
 * ```
 */
export function getFlags<T extends string[]>(
  flags: Record<string, unknown>,
  names: T
): Record<T[number], unknown> {
  const result: Record<string, unknown> = {};
  for (const name of names) {
    result[name] = flags[name];
  }
  return result as Record<T[number], unknown>;
}

