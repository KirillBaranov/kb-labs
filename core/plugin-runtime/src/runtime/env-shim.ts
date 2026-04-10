/**
 * Sandboxed environment variable access
 */

import type { PermissionSpec, EnvShim } from '@kb-labs/plugin-contracts';

/**
 * Environment variables that are always allowed (safe)
 */
const ALWAYS_ALLOWED = [
  'NODE_ENV',
  'CI',
  'DEBUG',
  'TZ',
  'LANG',
  'LC_ALL',
];

export interface CreateEnvShimOptions {
  permissions: PermissionSpec;
}

/**
 * Create a sandboxed env access function
 *
 * Non-whitelisted vars return undefined (no error thrown).
 */
export function createEnvShim(options: CreateEnvShimOptions): EnvShim {
  const { permissions } = options;
  const allowedPatterns = permissions.env?.read ?? [];

  return (key: string): string | undefined => {
    // Check always allowed
    if (ALWAYS_ALLOWED.includes(key)) {
      return process.env[key];
    }

    // Check whitelist patterns
    const isAllowed = allowedPatterns.some(pattern => {
      if (pattern.endsWith('*')) {
        // Prefix match: "KB_*" matches "KB_ANYTHING"
        const prefix = pattern.slice(0, -1);
        return key.startsWith(prefix);
      }
      // Exact match
      return key === pattern;
    });

    if (!isAllowed) {
      // Return undefined for non-allowed vars (no error)
      return undefined;
    }

    return process.env[key];
  };
}
