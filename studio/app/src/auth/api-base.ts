/**
 * @module @kb-labs/studio-app/auth/api-base
 *
 * Single source of truth for auth endpoint URLs.
 *
 * Auth calls must stay same-origin relative to whatever is serving the SPA
 * (Studio's bare server.js, or a production reverse proxy) — never jump to
 * `KB_API_BASE_URL`'s origin directly. The gateway only registers auth routes
 * at bare root (`/auth/me`, not `/api/auth/me` or `/api/v1/auth/me`), and the
 * session cookies' `Path` attribute (`/api/auth/refresh`, see
 * `services/gateway/app/src/auth/user-cookies.ts`) is scoped to that same
 * literal same-origin path. Studio's dev server (`server.js`) proxies
 * `/api/*` to the gateway origin, stripping the `/api` prefix so
 * `/api/auth/me` reaches the gateway's `/auth/me`.
 */
export function authUrl(path: string): string {
  return `/api${path}`;
}
