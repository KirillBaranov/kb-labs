/**
 * @module @kb-labs/core-sandbox/isolation/env-filter
 * Environment variable filtering
 */

/**
 * Pick only whitelisted environment variables
 * @param env - Full environment
 * @param allowlist - Allowed variable names (or patterns)
 * @returns Filtered environment
 */
export function pickEnv(
  env: Record<string, string | undefined>,
  allowlist?: string[]
): Record<string, string> {
  if (!allowlist || allowlist.length === 0) {
    return {};
  }

  const filtered: Record<string, string> = {};

  for (const key of allowlist) {
    const value = env[key];
    if (value !== undefined) {
      filtered[key] = value;
    }
  }

  return filtered;
}

