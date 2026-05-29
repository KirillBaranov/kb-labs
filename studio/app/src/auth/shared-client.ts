/**
 * @module @kb-labs/studio-app/auth/shared-client
 *
 * Module-level singleton AuthHttpClient for use by Studio pages.
 *
 * On unauthenticated (refresh failure) dispatches the `auth:unauthenticated`
 * CustomEvent, which AuthProvider listens to and transitions to anonymous state.
 *
 * For unit tests: replace the exported `authClient` reference via
 * `_setAuthClientForTesting(mockClient)` before rendering the component under
 * test, and restore it in afterEach.
 */

import { createAuthHttpClient, type AuthHttpClient } from './http-client.js';

function makeDefaultClient(): AuthHttpClient {
  return createAuthHttpClient({
    onUnauthenticated() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
      }
    },
  });
}

// The default client is created lazily so it can be replaced before first use.
let _client: AuthHttpClient | null = null;

/** The singleton auth-aware HTTP client for Studio pages. */
export const authClient: AuthHttpClient = {
  fetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    if (!_client) _client = makeDefaultClient();
    return _client.fetch<T>(path, init);
  },
};

/**
 * Replace the underlying client for testing.
 * Call with `null` to restore the default.
 *
 * @example
 * ```ts
 * const mockClient = { fetch: vi.fn() };
 * _setAuthClientForTesting(mockClient);
 * // ... render component ...
 * afterEach(() => _setAuthClientForTesting(null));
 * ```
 */
export function _setAuthClientForTesting(client: AuthHttpClient | null): void {
  _client = client;
}
