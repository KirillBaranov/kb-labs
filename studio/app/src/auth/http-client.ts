/**
 * @module @kb-labs/studio-app/auth/http-client
 *
 * Auth-aware HTTP client for Studio (ADR-0020, Phase 2.1).
 *
 * Responsibilities:
 *   1. Always sends `credentials: 'include'` so session cookies are forwarded.
 *   2. Injects `X-CSRF-Token` header (double-submit pattern) on every mutating
 *      request (POST/PUT/PATCH/DELETE) by reading the `kb_csrf` cookie.
 *   3. On 401: transparent single-flight token refresh via POST /api/auth/refresh,
 *      then retries the original request once.
 *   4. Multi-tab coordination via BroadcastChannel: if another tab is already
 *      refreshing, wait for `refresh:done` / `refresh:failed` instead of
 *      issuing a duplicate refresh (default timeout: 2 s, then self-refresh).
 *   5. If refresh fails: calls `onUnauthenticated` (caller redirects to /login)
 *      and rejects the original request.
 *
 * All browser globals (fetch, BroadcastChannel, document.cookie) are injected
 * via the options object so the module is fully testable in Node/vitest without
 * jsdom.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'kb_csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const BROADCAST_CHANNEL_NAME = 'kb_auth_refresh';
const DEFAULT_BROADCAST_TIMEOUT_MS = 2_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthHttpClientOptions {
  /** Prefix prepended to every path. Default: '/api'. */
  baseURL?: string;
  /** Refresh endpoint path. Default: '/api/auth/refresh'. */
  refreshPath?: string;
  /** Called when a refresh attempt fails (401 on the refresh call itself). */
  onUnauthenticated?: () => void;
  /** How long to wait for a cross-tab refresh:done before doing our own. */
  broadcastTimeoutMs?: number;
  /** Injected fetch — defaults to globalThis.fetch. */
  _fetch?: typeof fetch;
  /** Injected BroadcastChannel constructor — defaults to globalThis.BroadcastChannel. */
  _BroadcastChannel?: typeof BroadcastChannel;
  /** Reads a cookie by name — defaults to reading document.cookie. */
  _getCookie?: (name: string) => string | undefined;
}

export interface AuthHttpClient {
  /**
   * Make an authenticated request. Automatically:
   *  - Adds `credentials: 'include'`
   *  - Adds `X-CSRF-Token` header on mutating methods
   *  - Handles 401 with single-flight refresh + retry
   */
  fetch<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

// ── Cookie helper ─────────────────────────────────────────────────────────────

function parseCookies(cookieStr: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of cookieStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return map;
}

function defaultGetCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return parseCookies(document.cookie)[name];
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAuthHttpClient(opts: AuthHttpClientOptions = {}): AuthHttpClient {
  const baseURL = opts.baseURL ?? '/api';
  const refreshPath = opts.refreshPath ?? `${baseURL}/auth/refresh`;
  const onUnauthenticated = opts.onUnauthenticated ?? (() => {});
  const broadcastTimeoutMs = opts.broadcastTimeoutMs ?? DEFAULT_BROADCAST_TIMEOUT_MS;
  // Lazy delegate so vi.stubGlobal('fetch', ...) in tests is picked up at call time.
  const fetchFn: typeof fetch = opts._fetch ?? ((...args) => globalThis.fetch(...args));
  const BCClass = opts._BroadcastChannel ?? globalThis.BroadcastChannel;
  const getCookie = opts._getCookie ?? defaultGetCookie;

  // Single-flight refresh promise shared across concurrent calls in this tab.
  let refreshing: Promise<boolean> | null = null;

  // ── Core request ──────────────────────────────────────────────────────────

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${baseURL}${path}`;
    const method = (init.method ?? 'GET').toUpperCase();

    const headers: Record<string, string> = {
      // Only set Content-Type when there is a body — GET/HEAD requests must not send it.
      ...(init.body !== undefined && init.body !== null
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers as Record<string, string> | undefined),
    };

    // Double-submit CSRF on mutating methods.
    if (MUTATING_METHODS.has(method)) {
      const csrf = getCookie(CSRF_COOKIE);
      if (csrf) {
        headers[CSRF_HEADER] = csrf;
      }
    }

    return fetchFn(url, {
      ...init,
      headers,
      credentials: 'include',
    });
  }

  // ── BroadcastChannel coordination ─────────────────────────────────────────

  /**
   * Listen on `ch` for up to `timeoutMs` milliseconds.
   * - If `refresh:started` arrives → switch to waiting for `refresh:done/failed`
   *   (extended wait uses the full `broadcastTimeoutMs` from that point).
   * - If `refresh:done` arrives first → resolve true.
   * - If `refresh:failed` arrives first → resolve false.
   * - If timeout → resolve null (caller should do its own refresh).
   */
  function listenForCrossTabActivity(
    ch: InstanceType<typeof BCClass>,
    claimWindowMs: number,
  ): Promise<boolean | null> {
    return new Promise((resolve) => {
      let settled = false;

      const cleanup = (result: boolean | null) => {
        if (settled) return;
        settled = true;
        ch.onmessage = null;
        clearTimeout(claimTimer);
        clearTimeout(waitTimer);
        resolve(result);
      };

      let waitTimer: ReturnType<typeof setTimeout>;

      // Outer window: waiting to see if anyone claims the refresh.
      const claimTimer = setTimeout(() => cleanup(null), claimWindowMs);

      ch.onmessage = (ev: MessageEvent<{ type: string }>) => {
        const { type } = ev.data;
        if (type === 'refresh:started') {
          // Another tab claimed it. Extend wait up to broadcastTimeoutMs.
          clearTimeout(claimTimer);
          waitTimer = setTimeout(() => cleanup(false), broadcastTimeoutMs);
        } else if (type === 'refresh:done') {
          cleanup(true);
        } else if (type === 'refresh:failed') {
          cleanup(false);
        }
      };
    });
  }

  // ── Single-flight refresh ─────────────────────────────────────────────────

  function doRefresh(ch: InstanceType<typeof BCClass>): Promise<boolean> {
    if (refreshing) return refreshing;

    refreshing = (async () => {
      try {
        ch.postMessage({ type: 'refresh:started' });
        const res = await fetchFn(refreshPath, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          ch.postMessage({ type: 'refresh:failed' });
          onUnauthenticated();
          return false;
        }
        ch.postMessage({ type: 'refresh:done' });
        return true;
      } catch {
        ch.postMessage({ type: 'refresh:failed' });
        onUnauthenticated();
        return false;
      } finally {
        refreshing = null;
      }
    })();

    return refreshing;
  }

  // ── Public fetch ──────────────────────────────────────────────────────────

  async function clientFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await request(path, init);

    if (res.status !== 401) {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body });
      }
      return res.json() as Promise<T>;
    }

    // ── 401 handling ───────────────────────────────────────────────────────
    let ch: InstanceType<typeof BCClass> | null = null;
    try {
      ch = new BCClass(BROADCAST_CHANNEL_NAME);

      let refreshed: boolean;

      if (refreshing) {
        // Same tab already refreshing: piggyback on the in-flight promise.
        refreshed = await refreshing;
      } else {
        // Short claim window: listen for cross-tab activity before committing
        // to our own refresh. This avoids duplicate refreshes when another tab
        // just started and broadcasts refresh:started within this window.
        const CLAIM_WINDOW_MS = 50;
        const crossTab = await listenForCrossTabActivity(ch, CLAIM_WINDOW_MS);

        if (crossTab === null) {
          // Nobody claimed it during the window — we do it.
          refreshed = await doRefresh(ch);
        } else {
          // Another tab handled it (crossTab === true) or failed (false).
          refreshed = crossTab;
        }
      }

      if (!refreshed) {
        throw Object.assign(new Error('Session expired'), { status: 401 });
      }

      // Retry the original request once.
      const retried = await request(path, init);
      if (!retried.ok) {
        const body = await retried.json().catch(() => ({}));
        throw Object.assign(new Error(`HTTP ${retried.status}`), {
          status: retried.status,
          body,
        });
      }
      return retried.json() as Promise<T>;
    } finally {
      ch?.close();
    }
  }

  return { fetch: clientFetch };
}
