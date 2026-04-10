/**
 * Flag parsing helpers
 */

/**
 * Check if --limit or --limits flag is present
 */
export function shouldShowLimits(flags: Record<string, unknown>): boolean {
  return isTruthyBoolean(flags.limit) || isTruthyBoolean(flags.limits);
}

/**
 * Check if value is truthy boolean
 * Handles: true, "true", "yes", "y", "" (flag without value)
 */
export function isTruthyBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized === ''
    );
  }
  return false;
}
