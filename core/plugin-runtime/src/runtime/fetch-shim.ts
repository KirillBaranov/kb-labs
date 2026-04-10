/**
 * Sandboxed fetch implementation with URL whitelist
 */

import type { PermissionSpec, FetchShim } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*') // * -> .*
    .replace(/\?/g, '.'); // ? -> .

  return new RegExp(`^${escaped}$`);
}

export interface CreateFetchShimOptions {
  permissions: PermissionSpec;
}

/**
 * Create a sandboxed fetch with URL whitelist
 */
export function createFetchShim(options: CreateFetchShimOptions): FetchShim {
  const { permissions } = options;

  // Convert allowed patterns to regexes
  const allowedPatterns = (permissions.network?.fetch ?? []).map(pattern => ({
    pattern,
    regex: globToRegex(pattern),
  }));

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // Extract URL
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      // Request object
      url = input.url;
    }

    // Check if URL is allowed
    const isAllowed = allowedPatterns.some(({ regex }) => regex.test(url));

    if (!isAllowed) {
      throw new PermissionError(`Network access denied`, {
        url,
        allowedPatterns: permissions.network?.fetch ?? [],
      });
    }

    // Call native fetch
    return globalThis.fetch(input, init);
  };
}
