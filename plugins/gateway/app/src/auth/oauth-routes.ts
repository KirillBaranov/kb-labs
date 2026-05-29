/**
 * @module @kb-labs/gateway-app/auth/oauth-routes
 *
 * HTTP routes for the redirect/OAuth identity flow (ADR-0020, Step 4 + 4b).
 *
 *   GET /auth/oauth/:id/start     — mint an opaque `state`, persist the flow
 *                                   context in KV, set a SameSite=Lax state
 *                                   cookie, then 302 to the upstream IdP.
 *   GET /auth/oauth/:id/callback  — verify the state (KV + cookie binding +
 *                                   one-shot consume + cross-tenant + mix-up
 *                                   guards), run the provider through
 *                                   userAuthService.login (DD-6), set the
 *                                   session cookies, then 302 to returnTo.
 *
 * Security invariants (Step 4b):
 *   - **Open-redirect guard**: returnTo is validated to a same-origin
 *     relative path (validateReturnTo); anything else collapses to '/'.
 *   - **State-cookie binding**: the query `state` must equal the value in
 *     the Lax state cookie — defends against login-CSRF / state fixation.
 *   - **One-shot state**: OAuthStateStore.consume deletes on read, so a
 *     replayed callback cannot be processed twice.
 *   - **Cross-tenant guard**: the tenant the callback Host resolves to must
 *     match the tenant the state was minted for.
 *   - **Mix-up guard**: the provider is taken from the KV state, not the
 *     URL — and the URL :id must match it.
 *   - **Per-IP rate-limit**: callbacks are throttled before any KV / provider
 *     work to blunt floods.
 *   - Secrets (code / id_token / session) are never logged.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  ProviderRegistry,
  TenantResolver,
  OAuthStateStore,
  RateLimiter,
  SessionResult,
} from '@kb-labs/gateway-auth';
import { AuthError, issueCsrfToken } from '@kb-labs/gateway-auth';
import type { IRedirectIdentityProvider } from '@kb-labs/core-contracts';
import type { UserAuthServiceForRoutes } from './user-routes.js';
import { validateReturnTo } from './oauth-return-to.js';
import {
  setSessionCookies,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  COOKIE_OAUTH_STATE,
  type CookieOptions,
} from './user-cookies.js';

/** State cookie / KV TTL — abandoned flows self-clean after this window. */
const OAUTH_STATE_TTL_SEC = 10 * 60;

export interface OAuthRouteDeps {
  userAuthService: UserAuthServiceForRoutes;
  providers: ProviderRegistry;
  tenantResolver: TenantResolver;
  oauthState: OAuthStateStore;
  cookieOpts: CookieOptions;
  /** Optional limiter; per-IP callback throttling is skipped when absent. */
  rateLimiter?: RateLimiter;
  /** Max callbacks per IP per minute. Default 60 when a limiter is present. */
  oauthCallbackPerIpPerMinute?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookies(request: FastifyRequest): Record<string, string | undefined> {
  return (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies ?? {};
}

/** Builds the absolute callback URL from the request Host (nginx-set in prod). */
function callbackUrl(request: FastifyRequest, id: string, secure: boolean): string {
  const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
  const proto = secure ? 'https' : 'http';
  return `${proto}://${host}/api/auth/oauth/${id}/callback`;
}

function isRedirectProvider(
  p: ReturnType<ProviderRegistry['get']>,
): p is IRedirectIdentityProvider {
  return !!p && p.kind === 'redirect';
}

function accessTtl(result: SessionResult): number {
  return result.access.expiresInSec;
}
function refreshTtl(result: SessionResult): number {
  return result.refresh.expiresInSec;
}

// ── Registrar ───────────────────────────────────────────────────────────────────

export function registerOAuthRoutes(app: FastifyInstance, deps: OAuthRouteDeps): void {
  const { userAuthService, providers, tenantResolver, oauthState, cookieOpts, rateLimiter } = deps;
  const callbackPerIpPerMinute = deps.oauthCallbackPerIpPerMinute ?? 60;

  /** Clear the state cookie and bounce to the login page with an error flag. */
  function failCallback(reply: FastifyReply): FastifyReply {
    clearOAuthStateCookie(reply, cookieOpts);
    return reply.redirect('/login?error=oauth', 302);
  }

  // ── GET /auth/oauth/:id/start ─────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { returnTo?: string } }>(
    '/auth/oauth/:id/start',
    { schema: { tags: ['Auth'], summary: 'Begin a redirect/OAuth login flow' } },
    async (request, reply) => {
      const { id } = request.params;
      const provider = providers.get(id);
      if (!isRedirectProvider(provider)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Unknown or non-redirect provider' });
      }

      // Tenant is derived from Host (authoritative in subdomain deployments).
      const host = typeof request.headers.host === 'string' ? request.headers.host : '';
      const tenantId = tenantResolver.resolve(host) ?? '';

      const returnTo = validateReturnTo(request.query?.returnTo);
      const state = issueCsrfToken();
      const redirectUri = callbackUrl(request, id, cookieOpts.cookieSecure);

      const startResult = await provider.startAuthorization({ state, redirectUri });

      await oauthState.put(state, {
        providerId: id,
        tenantId,
        returnTo,
        session: startResult.session,
        createdAt: Date.now(),
      });

      setOAuthStateCookie(reply, state, cookieOpts, OAUTH_STATE_TTL_SEC);
      return reply.redirect(startResult.redirectUrl, 302);
    },
  );

  // ── GET /auth/oauth/:id/callback ───────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { state?: string; code?: string; error?: string } }>(
    '/auth/oauth/:id/callback',
    { schema: { tags: ['Auth'], summary: 'Complete a redirect/OAuth login flow' } },
    async (request, reply) => {
      // Per-IP rate-limit GATE first — before any KV / provider work, so a flood
      // of callbacks from one source costs ~0 beyond the counter bump.
      if (rateLimiter) {
        const r = await rateLimiter.check(`rl:oauth:cb:ip:${request.ip}`, {
          max: callbackPerIpPerMinute,
          windowMs: 60_000,
        });
        if (!r.allowed) {
          reply.header('Retry-After', String(r.retryAfterSec));
          return reply.code(429).send({ error: 'Too Many Requests', message: 'Rate limit exceeded', retryAfterSec: r.retryAfterSec });
        }
      }

      const { id } = request.params;
      const { state, code, error } = request.query ?? {};

      // IdP signalled an error (user denied consent, etc.) — never touch the
      // provider; just bounce back to login.
      if (error) {
        return failCallback(reply);
      }

      // State-cookie binding: the query state must echo the Lax cookie value.
      const cookieState = getCookies(request)[COOKIE_OAUTH_STATE];
      if (!state || !cookieState || state !== cookieState) {
        return failCallback(reply);
      }

      // One-shot consume — unknown / forged / replayed states resolve to null.
      const record = await oauthState.consume(state);
      if (!record) {
        return failCallback(reply);
      }

      // Mix-up guard: the URL :id must match the provider that minted the state.
      if (record.providerId !== id) {
        return failCallback(reply);
      }

      // Cross-tenant guard: the callback Host must resolve to the same tenant
      // the state was minted for (when the Host is subdomain-routed at all).
      const host = typeof request.headers.host === 'string' ? request.headers.host : '';
      const callbackTenant = tenantResolver.resolve(host);
      if (callbackTenant !== null && callbackTenant !== record.tenantId) {
        return failCallback(reply);
      }

      // The provider is the source of truth from the KV record (not the URL).
      const provider = providers.get(record.providerId);
      if (!isRedirectProvider(provider)) {
        return failCallback(reply);
      }

      const redirectUri = callbackUrl(request, record.providerId, cookieOpts.cookieSecure);

      try {
        // DD-6: reuse the standard login path. The provider's authenticate()
        // receives the callback bundle and resolves it to an email; the service
        // does email→user→session→tokens exactly as for password login.
        const result = await userAuthService.login(
          {
            providerId: record.providerId,
            input: { code, state, session: record.session, redirectUri },
          },
          record.tenantId,
          { ip: request.ip, userAgent: request.headers['user-agent'] as string | undefined },
        );

        setSessionCookies(reply, {
          accessToken: result.access.token,
          accessTtlSec: accessTtl(result),
          refreshToken: result.refresh.token,
          refreshTtlSec: refreshTtl(result),
          csrfToken: result.csrf,
        }, cookieOpts);

        clearOAuthStateCookie(reply, cookieOpts);
        return reply.redirect(record.returnTo, 302);
      } catch (err) {
        if (err instanceof AuthError) {
          return failCallback(reply);
        }
        throw err;
      }
    },
  );
}
