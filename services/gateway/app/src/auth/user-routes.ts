/**
 * @module @kb-labs/gateway-app/auth/user-routes
 *
 * HTTP route registrar for the user-auth flow (ADR-0020, Phase 1.16).
 *
 * Endpoints registered here:
 *   GET   /auth/me            (user cookie or machine Bearer)
 *   GET   /auth/providers
 *   POST  /auth/login
 *   POST  /auth/login/cli     (CLI-only: returns tokens in body, never sets cookies)
 *   POST  /auth/refresh/cli   (CLI-only: body refreshToken, returns tokens in body)
 *   POST  /auth/logout
 *   GET   /auth/permissions
 *   POST  /auth/activate
 *   POST  /auth/password/change
 *   GET   /auth/sessions
 *   POST  /auth/sessions/revoke-all   (before /:fam/revoke to avoid param capture)
 *   POST  /auth/sessions/:fam/revoke
 *   POST  /auth/invites
 *   POST  /auth/invites/:id/revoke
 *   GET   /auth/invites
 *   GET   /auth/users
 *   POST  /auth/users/:id/disable
 *   POST  /auth/users/:id/enable
 *
 * NOTE: POST /auth/refresh is NOT registered here. Instead,
 * createUserRefreshFn() returns a handler that registerAuthRoutes() wires
 * as its `userExt.userRefreshFn` option — avoiding duplicate route registration.
 *
 * Security invariants:
 *   - All state-mutating cookie-auth endpoints validate CSRF (double-submit).
 *   - Admin endpoints check PDP via PERMISSIONS enum (CD-7).
 *   - /auth/me never returns role/group fields.
 *   - /auth/login/cli and /auth/refresh/cli exist ONLY so a non-browser
 *     client (the CLI) can obtain a Bearer-usable user token — they must
 *     NEVER call setSessionCookies(). Mixing the two response shapes on one
 *     route was deliberately avoided (see /auth/login/cli below) so "does
 *     this route ever put a token in a JSON body" stays a static, greppable
 *     question instead of depending on request shape.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  UsersStore,
  SessionsStore,
  InvitesStore,
  ProviderRegistry,
  IPolicyDecisionPoint,
  JwtConfig,
  SessionResult,
  RateLimiter,
  TenantResolver,
  OAuthStateStore,
} from '@kb-labs/gateway-auth';
import { registerOAuthRoutes } from './oauth-routes.js';
import { AuthError, verifyCsrfToken } from '@kb-labs/gateway-auth';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import type { UserAuthContext } from './user-auth-middleware.js';
import {
  setSessionCookies,
  clearSessionCookies,
  COOKIE_REFRESH,
  COOKIE_CSRF,
  type CookieOptions,
} from './user-cookies.js';

export type { UserAuthContext };

// ── Service interface (matches createUserAuthService return type) ──────────────

/**
 * Minimal interface for the UserAuthService used by user-routes.
 *
 * Mirrors the actual return type of createUserAuthService from gateway-auth.
 * login() takes (input: LoginInput, tenantId, deviceCtx) — three separate args.
 * refresh() / logout() take the full refresh JWT string (service verifies internally).
 * activate() takes { activationToken, password, deviceCtx }.
 */
export interface UserAuthServiceForRoutes {
  login(
    input: { providerId: string; input: unknown },
    tenantId: string,
    deviceCtx: { ip?: string; userAgent?: string },
  ): Promise<SessionResult>;
  refresh(refreshToken: string): Promise<SessionResult>;
  logout(refreshToken: string): Promise<void>;
  changePassword(input: {
    userId: string;
    currentFamilyId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void>;
  activate(input: {
    activationToken: string;
    password: string;
    deviceCtx: { ip?: string; userAgent?: string };
  }): Promise<SessionResult>;
}

export interface UserAuthRouteDeps {
  userAuthService: UserAuthServiceForRoutes;
  users: UsersStore;
  sessions: SessionsStore;
  invites: InvitesStore;
  providers: ProviderRegistry;
  pdp: IPolicyDecisionPoint;
  /** Resolves the tenant from the Host header — used to prevent tenantId bypass via body. */
  tenantResolver: TenantResolver;
  cookieOpts: CookieOptions;
  accessTtlSec: number;
  refreshTtlSec: number;
  inviteTtlMs: number;
  jwtConfig: JwtConfig;
  /** Fixed-window rate limiter for login/activate endpoints. Optional — rate limiting
   *  is silently skipped when absent (e.g. unit tests without IKVStore). */
  rateLimiter?: RateLimiter;
  /** Rate limit thresholds (defaults applied when rateLimiter is present). */
  authRateLimit?: {
    loginPerIpPerMinute: number;
    loginPerEmailPerMinute: number;
  };
  /** OAuth state store. When present, the redirect/OAuth routes are registered. */
  oauthState?: OAuthStateStore;
  /** Per-IP callback rate-limit for the OAuth callback (defaults applied when set). */
  oauthCallbackPerIpPerMinute?: number;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookies(request: FastifyRequest): Record<string, string | undefined> {
  return (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies ?? {};
}

// ── Auth/CSRF helpers ─────────────────────────────────────────────────────────

/** Returns the UserAuthContext or sends 401 and returns null. */
function requireUser(request: FastifyRequest, reply: FastifyReply): UserAuthContext | null {
  const ctx = request.userAuthContext;
  if (!ctx) {
    void reply.code(401).send({ error: 'Unauthorized', message: 'No active user session' });
    return null;
  }
  return ctx;
}

/**
 * Validates double-submit CSRF token.
 * Returns true if valid; sends 403 and returns false otherwise.
 */
function checkCsrf(request: FastifyRequest, reply: FastifyReply): boolean {
  const cookieVal = getCookies(request)[COOKIE_CSRF];
  const headerVal = request.headers['x-csrf-token'];
  const headerStr = typeof headerVal === 'string' ? headerVal : undefined;
  if (!verifyCsrfToken(cookieVal, headerStr)) {
    void reply.code(403).send({ error: 'Forbidden', message: 'CSRF token mismatch' });
    return false;
  }
  return true;
}

// ── Cookie TTL helpers ────────────────────────────────────────────────────────

/** Derives MaxAge for access cookie from SessionResult. */
function accessTtl(result: SessionResult): number {
  return result.access.expiresInSec;
}

/** Derives MaxAge for refresh cookie from SessionResult. */
function refreshTtl(result: SessionResult): number {
  return result.refresh.expiresInSec;
}

// ── User refresh handler factory ──────────────────────────────────────────────

/**
 * Creates the user-cookie refresh handler for POST /auth/refresh.
 *
 * Pass this as `userExt.userRefreshFn` to `registerAuthRoutes()`. Returns
 * true if the cookie was present and the response has been sent. Returns
 * false (no response sent) if there is no refresh cookie, letting the
 * machine body-refresh path take over.
 */
export function createUserRefreshFn(
  deps: Pick<UserAuthRouteDeps, 'userAuthService' | 'cookieOpts'>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<boolean> {
  const { userAuthService, cookieOpts } = deps;

  return async function userRefreshFn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    const refreshCookie = getCookies(request)[COOKIE_REFRESH];
    if (!refreshCookie) {return false;}

    try {
      const result = await userAuthService.refresh(refreshCookie);
      setSessionCookies(reply, {
        accessToken: result.access.token,
        accessTtlSec: accessTtl(result),
        refreshToken: result.refresh.token,
        refreshTtlSec: refreshTtl(result),
        csrfToken: result.csrf,
      }, cookieOpts);
      void reply.send({ ok: true });
      return true;
    } catch (err) {
      if (err instanceof AuthError) {
        clearSessionCookies(reply, cookieOpts);
        void reply.code(401).send({ error: 'Unauthorized', message: 'Session expired or revoked' });
        return true;
      }
      throw err;
    }
  };
}

// ── Login rate-limit helpers (shared by /auth/login and /auth/login/cli) ──────
//
// The CLI login route deliberately reuses the exact same rate-limit keys
// (rl:login:ip:*, rl:login:email:*) as the browser login route — both
// represent the same brute-force surface against the same password store,
// and an attacker must not be able to bypass one route's limit by switching
// to the other.

interface LoginRateLimitCfg {
  loginPerIpPerMinute: number;
  loginPerEmailPerMinute: number;
}

/** Peek (non-incrementing) gate, called before the bcrypt-cost login attempt. */
async function peekLoginRateLimit(
  reply: FastifyReply,
  ip: string,
  emailNorm: string,
  rateLimiter: RateLimiter,
  cfg: LoginRateLimitCfg,
): Promise<boolean> {
  const [ipPeek, emailPeek] = await Promise.all([
    rateLimiter.peek(`rl:login:ip:${ip}`, { max: cfg.loginPerIpPerMinute, windowMs: 60_000 }),
    rateLimiter.peek(`rl:login:email:${emailNorm}`, { max: cfg.loginPerEmailPerMinute, windowMs: 60_000 }),
  ]);
  if (!ipPeek.allowed || !emailPeek.allowed) {
    const retryAfter = !ipPeek.allowed ? ipPeek.retryAfterSec : (!emailPeek.allowed ? emailPeek.retryAfterSec : 60);
    reply.header('Retry-After', String(retryAfter));
    void reply.code(429).send({ error: 'Too Many Requests', message: 'Rate limit exceeded', retryAfterSec: retryAfter });
    return false;
  }
  return true;
}

/** Increments the failure counters after a failed login attempt; returns false if this trips the limit (429 already sent). */
async function recordLoginFailure(
  reply: FastifyReply,
  ip: string,
  emailNorm: string,
  rateLimiter: RateLimiter,
  cfg: LoginRateLimitCfg,
): Promise<boolean> {
  const [ipResult, emailResult] = await Promise.all([
    rateLimiter.check(`rl:login:ip:${ip}`, { max: cfg.loginPerIpPerMinute, windowMs: 60_000 }),
    rateLimiter.check(`rl:login:email:${emailNorm}`, { max: cfg.loginPerEmailPerMinute, windowMs: 60_000 }),
  ]);
  if (!ipResult.allowed || !emailResult.allowed) {
    const retryAfter = !ipResult.allowed ? ipResult.retryAfterSec : (!emailResult.allowed ? emailResult.retryAfterSec : 60);
    reply.header('Retry-After', String(retryAfter));
    void reply.code(429).send({ error: 'Too Many Requests', message: 'Rate limit exceeded', retryAfterSec: retryAfter });
    return false;
  }
  return true;
}

// ── Route registrar ───────────────────────────────────────────────────────────

export function registerUserAuthRoutes(app: FastifyInstance, deps: UserAuthRouteDeps): void {
  const { userAuthService, users, sessions, invites, providers, pdp, tenantResolver, cookieOpts, inviteTtlMs, rateLimiter, authRateLimit, oauthState, oauthCallbackPerIpPerMinute } = deps;
  // Apply config defaults so the rest of the handler can use them without null-checks.
  const authRateLimitCfg = { loginPerIpPerMinute: 10, loginPerEmailPerMinute: 5, ...authRateLimit };

  // Redirect/OAuth routes are only registered when an OAuth state store is wired
  // (DD-5). Without a (shared) KV-backed store there is nowhere to hold the
  // per-attempt `state` binding, so the flow is simply unavailable.
  if (oauthState) {
    registerOAuthRoutes(app, {
      userAuthService,
      providers,
      tenantResolver,
      oauthState,
      cookieOpts,
      rateLimiter,
      oauthCallbackPerIpPerMinute,
    });
  }

  // ── GET /auth/me ────────────────────────────────────────────────────────────
  // Handles both user cookie auth and machine Bearer auth. User takes precedence.
  // NOTE: Removed from registerAuthRoutes to avoid duplicate route registration.
  app.get('/auth/me', {
    schema: { tags: ['Auth'], summary: 'Get profile for the authenticated caller' },
  }, async (request, reply) => {
    // User cookie auth (takes precedence)
    if (request.userAuthContext) {
      const { userId, tenantId } = request.userAuthContext;
      const user = await users.getById(userId);
      if (!user) {
        return reply.code(404).send({ error: 'Not found', message: 'User record not found' });
      }
      // Never expose role/group fields — return minimal public fields only.
      return reply.send({ userId: user.userId, email: user.email, tenantId });
    }

    // Machine Bearer auth (includes LOCAL_ADMIN, injected when auth.enabled=false —
    // see B-023). Studio's PublicUser type (studio/app/src/auth/auth-provider.tsx)
    // requires `email`/`tenantId`; a machine context has neither concept, so we
    // derive Studio-displayable stand-ins from userId/namespaceId rather than
    // omitting the fields — omitting them broke Studio's header/status bar under
    // `--local` installs, where every request runs as this machine context.
    const auth = request.authContext;
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Not authenticated' });
    }
    return reply.send({
      userId: auth.userId,
      namespaceId: auth.namespaceId,
      email: auth.userId,
      tenantId: auth.namespaceId,
    });
  });

  // ── GET /auth/providers ─────────────────────────────────────────────────────
  // Public (in PUBLIC_ROUTES in middleware.ts).
  app.get('/auth/providers', {
    schema: { tags: ['Auth'], summary: 'List registered identity providers' },
  }, async (_request, reply) => {
    return reply.send({ providers: providers.list() });
  });

  // ── POST /auth/login ────────────────────────────────────────────────────────
  // Public (in PUBLIC_ROUTES). Rate-limited per-IP + per-email via fixed-window counter.
  app.post<{ Body: { email?: string; password?: string; providerId?: string; tenantId?: string } }>('/auth/login', {
    schema: { tags: ['Auth'], summary: 'Login with email/password (sets session cookies)' },
  }, async (request, reply) => {
    const { email, password, providerId, tenantId: bodyTenantId } = request.body ?? {};
    if (typeof email !== 'string' || !email) {
      return reply.code(400).send({ error: 'Bad Request', message: 'email is required' });
    }
    if (typeof password !== 'string' || !password) {
      return reply.code(400).send({ error: 'Bad Request', message: 'password is required' });
    }

    // Derive tenantId — Host header is authoritative (set by nginx in production).
    // bodyTenantId is accepted only as a fallback when the Host doesn't resolve to
    // a valid tenant (e.g. direct gateway access: localhost:4000, CI without nginx).
    // This prevents tenant isolation bypass via body in subdomain deployments.
    const host = typeof request.headers.host === 'string' ? request.headers.host : '';
    const hostTenant = tenantResolver.resolve(host);
    const tenantId = hostTenant ?? bodyTenantId ?? '';

    // Rate-limit GATE (peek, non-incrementing) BEFORE invoking the provider,
    // which runs a bcrypt compare (~300ms CPU at cost 12). Once the per-IP or
    // per-email failure window is exhausted we reject here, so a flood of
    // requests past the limit costs ~0 CPU instead of one bcrypt each. The
    // counter is only INCREMENTED on an actual auth failure (catch block
    // below) — successful logins never count, so legitimate users are never
    // throttled.
    if (rateLimiter) {
      const emailNorm = email.toLowerCase().trim();
      if (!(await peekLoginRateLimit(reply, request.ip, emailNorm, rateLimiter, authRateLimitCfg))) {
        return;
      }
    }

    try {
      const result = await userAuthService.login(
        { providerId: providerId ?? 'email-password', input: { email, password } },
        tenantId,
        { ip: request.ip, userAgent: request.headers['user-agent'] as string | undefined },
      );

      setSessionCookies(reply, {
        accessToken: result.access.token,
        accessTtlSec: accessTtl(result),
        refreshToken: result.refresh.token,
        refreshTtlSec: refreshTtl(result),
        csrfToken: result.csrf,
      }, cookieOpts);

      return reply.send({ ok: true });
    } catch (err) {
      // CD-8: always return identical shape regardless of failure reason.
      if (err instanceof AuthError) {
        // Rate-limit only on failed authentication attempts. Counting only
        // failures prevents false positives for legitimate users while still
        // protecting against brute-force attacks.
        if (rateLimiter) {
          const emailNorm = email.toLowerCase().trim();
          if (!(await recordLoginFailure(reply, request.ip, emailNorm, rateLimiter, authRateLimitCfg))) {
            return;
          }
        }
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      throw err;
    }
  });

  // ── POST /auth/login/cli ────────────────────────────────────────────────────
  // Public (in PUBLIC_ROUTES). CLI-only analogue of /auth/login: same
  // credential check, same shared rate-limit keys, but returns the token
  // pair in the JSON body instead of setting cookies — a CLI process has
  // nowhere to store a cookie. Deliberately a separate route rather than a
  // flag on /auth/login (see module docblock) so this route's shape is
  // statically "always tokens in body, never cookies," not conditional.
  app.post<{ Body: { email?: string; password?: string; providerId?: string; tenantId?: string } }>('/auth/login/cli', {
    schema: { tags: ['Auth'], summary: 'Login with email/password (CLI: returns tokens in body)' },
  }, async (request, reply) => {
    const { email, password, providerId, tenantId: bodyTenantId } = request.body ?? {};
    if (typeof email !== 'string' || !email) {
      return reply.code(400).send({ error: 'Bad Request', message: 'email is required' });
    }
    if (typeof password !== 'string' || !password) {
      return reply.code(400).send({ error: 'Bad Request', message: 'password is required' });
    }

    const host = typeof request.headers.host === 'string' ? request.headers.host : '';
    const hostTenant = tenantResolver.resolve(host);
    const tenantId = hostTenant ?? bodyTenantId ?? '';

    if (rateLimiter) {
      const emailNorm = email.toLowerCase().trim();
      if (!(await peekLoginRateLimit(reply, request.ip, emailNorm, rateLimiter, authRateLimitCfg))) {
        return;
      }
    }

    try {
      const result = await userAuthService.login(
        { providerId: providerId ?? 'email-password', input: { email, password } },
        tenantId,
        { ip: request.ip, userAgent: request.headers['user-agent'] as string | undefined },
      );

      return reply.send({
        accessToken: result.access.token,
        refreshToken: result.refresh.token,
        expiresIn: accessTtl(result),
        tenantId,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        if (rateLimiter) {
          const emailNorm = email.toLowerCase().trim();
          if (!(await recordLoginFailure(reply, request.ip, emailNorm, rateLimiter, authRateLimitCfg))) {
            return;
          }
        }
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      throw err;
    }
  });

  // ── POST /auth/refresh/cli ──────────────────────────────────────────────────
  // Public (in PUBLIC_ROUTES) — the refresh token in the body is the proof of
  // identity, same as the machine body-refresh path in routes.ts. CLI-only
  // analogue of the cookie-based user refresh (createUserRefreshFn below):
  // takes the refresh token as a plain body field instead of a cookie, and
  // returns the new pair in the body instead of Set-Cookie.
  app.post<{ Body: { refreshToken?: string } }>('/auth/refresh/cli', {
    schema: { tags: ['Auth'], summary: 'Refresh a CLI session token pair' },
  }, async (request, reply) => {
    const { refreshToken } = request.body ?? {};
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return reply.code(400).send({ error: 'Bad Request', message: 'refreshToken is required' });
    }

    try {
      const result = await userAuthService.refresh(refreshToken);
      return reply.send({
        accessToken: result.access.token,
        refreshToken: result.refresh.token,
        expiresIn: accessTtl(result),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
      }
      throw err;
    }
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────────
  // Cookie-auth, CSRF required.
  app.post('/auth/logout', {
    schema: { tags: ['Auth'], summary: 'Logout and clear session cookies' },
  }, async (request, reply) => {
    const ctx = requireUser(request, reply);
    if (!ctx) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const refreshCookie = getCookies(request)[COOKIE_REFRESH];
    if (refreshCookie) {
      // The service verifies the token internally — just pass it through.
      await userAuthService.logout(refreshCookie).catch(() => {});
    }

    clearSessionCookies(reply, cookieOpts);
    return reply.send({ ok: true });
  });

  // ── GET /auth/permissions ───────────────────────────────────────────────────
  // Cookie-auth. Returns the caller's effective permissions via PDP (CD-3).
  app.get('/auth/permissions', {
    schema: { tags: ['Auth'], summary: 'List permissions for the authenticated user' },
  }, async (request, reply) => {
    // User cookie auth takes precedence — enumerate via PDP for per-user RBAC.
    if (request.userAuthContext) {
      const ctx = request.userAuthContext;
      const permissions = await pdp.enumeratePermissions({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        type: 'user',
      });
      return reply.send({ permissions });
    }

    // Machine Bearer auth (including LOCAL_ADMIN when auth is disabled).
    // Permissions are already embedded in the machine AuthContext.
    const auth = request.authContext;
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'No active session' });
    }
    return reply.send({ permissions: auth.permissions });
  });

  // ── POST /auth/activate ─────────────────────────────────────────────────────
  // Public (in PUBLIC_ROUTES). Creates user from invite + auto-logs in.
  app.post<{ Body: { token?: string; password?: string } }>('/auth/activate', {
    schema: { tags: ['Auth'], summary: 'Activate invite and create account (auto-login)' },
  }, async (request, reply) => {
    const { token, password } = request.body ?? {};
    if (typeof token !== 'string' || !token) {
      return reply.code(400).send({ error: 'Bad Request', message: 'token is required' });
    }
    if (typeof password !== 'string' || !password) {
      return reply.code(400).send({ error: 'Bad Request', message: 'password is required' });
    }

    try {
      const result = await userAuthService.activate({
        activationToken: token,
        password,
        deviceCtx: {
          ip: request.ip,
          userAgent: request.headers['user-agent'] as string | undefined,
        },
      });

      setSessionCookies(reply, {
        accessToken: result.access.token,
        accessTtlSec: accessTtl(result),
        refreshToken: result.refresh.token,
        refreshTtlSec: refreshTtl(result),
        csrfToken: result.csrf,
      }, cookieOpts);

      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof AuthError) {
        const code = (err as AuthError).code;
        if (code === 'unknown_invite') {
          // 401 Unauthorized: token not found (garbage, never issued, or swept by TTL).
          // Use error:'invalid_invite' so the activate-page shows the user-friendly
          // "This invite link is invalid or expired" message (same as 422 path).
          return reply.code(401).send({ error: 'invalid_invite', message: 'Invalid or expired invite' });
        }
        if (code === 'invalid_invite') {
          // 422 Unprocessable Entity: the token was found but is expired or already consumed.
          // The client (activate-page) maps error:'invalid_invite' to the
          // user-friendly "This invite link is invalid or expired" message.
          return reply.code(422).send({ error: 'invalid_invite', message: 'Invalid or expired invite' });
        }
        return reply.code(400).send({ error: 'Bad Request', message: err.message });
      }
      throw err;
    }
  });

  // ── POST /auth/password/change ──────────────────────────────────────────────
  // Cookie-auth, CSRF required.
  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>('/auth/password/change', {
    schema: { tags: ['Auth'], summary: 'Change password (revokes all other sessions)' },
  }, async (request, reply) => {
    const ctx = requireUser(request, reply);
    if (!ctx) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || !newPassword) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'currentPassword and newPassword are required',
      });
    }

    try {
      await userAuthService.changePassword({
        userId: ctx.userId,
        currentFamilyId: ctx.familyId,
        currentPassword,
        newPassword,
      });
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof AuthError) {
        const code = (err as AuthError).code;
        if (code === 'invalid_current_password') {
          return reply.code(400).send({ error: 'Bad Request', message: 'Current password is incorrect' });
        }
        if (code === 'weak_password') {
          return reply.code(400).send({ error: 'Bad Request', message: err.message });
        }
      }
      throw err;
    }
  });

  // ── GET /auth/sessions ──────────────────────────────────────────────────────
  // Cookie-auth. Lists all session families for the authenticated user.
  app.get('/auth/sessions', {
    schema: { tags: ['Auth'], summary: 'List active sessions for the authenticated user' },
  }, async (request, reply) => {
    const ctx = requireUser(request, reply);
    if (!ctx) {return;}

    const families = await sessions.listFamiliesByUser(ctx.userId);
    return reply.send({
      sessions: families.map((f) => ({
        familyId: f.familyId,
        createdAt: f.createdAt,
        lastUsedAt: f.lastUsedAt,
        userAgent: f.userAgent,
        ipFirst: f.ipFirst,
        isCurrent: f.familyId === ctx.familyId,
      })),
    });
  });

  // ── POST /auth/sessions/revoke-all ──────────────────────────────────────────
  // Registered BEFORE /:fam/revoke to prevent param capture.
  // Cookie-auth, CSRF required.
  app.post('/auth/sessions/revoke-all', {
    schema: { tags: ['Auth'], summary: 'Revoke all sessions except the current one' },
  }, async (request, reply) => {
    const ctx = requireUser(request, reply);
    if (!ctx) {return;}
    if (!checkCsrf(request, reply)) {return;}

    await sessions.revokeAllUserSessionsExcept(ctx.userId, ctx.familyId);
    return reply.send({ ok: true });
  });

  // ── POST /auth/sessions/:fam/revoke ─────────────────────────────────────────
  // Cookie-auth, CSRF required.
  app.post<{ Params: { fam: string } }>('/auth/sessions/:fam/revoke', {
    schema: { tags: ['Auth'], summary: 'Revoke a specific session family' },
  }, async (request, reply) => {
    const ctx = requireUser(request, reply);
    if (!ctx) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const { fam } = request.params;

    // Ownership check — only allow revoking own sessions.
    const ownFamilies = await sessions.listFamiliesByUser(ctx.userId);
    if (!ownFamilies.some((f) => f.familyId === fam)) {
      return reply.code(404).send({ error: 'Not found', message: 'Session not found' });
    }

    await sessions.revokeFamily(fam);
    return reply.send({ ok: true });
  });

  // ── Admin permission helper ───────────────────────────────────────────────

  /** Checks the given permission; sends 401 or 403 and returns false on failure. */
  async function requirePermission(
    request: FastifyRequest,
    reply: FastifyReply,
    permission: string,
  ): Promise<boolean> {
    const ctx = requireUser(request, reply);
    if (!ctx) {return false;}

    const decision = await pdp.check(
      { userId: ctx.userId, tenantId: ctx.tenantId, type: 'user' },
      permission,
    );

    if (!decision.allow) {
      void reply.code(403).send({ error: 'Forbidden', message: `Permission denied: ${permission}` });
      return false;
    }
    return true;
  }

  // ── POST /auth/invites ──────────────────────────────────────────────────────
  app.post<{ Body: { email?: string; groupId?: string; ttlMs?: number } }>('/auth/invites', {
    schema: { tags: ['Auth'], summary: 'Create an invite for a new user (admin only)' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.INVITES_WRITE))) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const ctx = request.userAuthContext!;
    const { email, groupId, ttlMs: bodyTtlMs } = request.body ?? {};
    if (!email || !groupId) {
      return reply.code(400).send({ error: 'Bad Request', message: 'email and groupId are required' });
    }

    // Allow callers to specify a custom TTL (e.g., short-lived invites for testing
    // AUTH-14). If not provided or invalid, fall back to the server default.
    const effectiveTtlMs =
      typeof bodyTtlMs === 'number' && bodyTtlMs > 0 ? bodyTtlMs : inviteTtlMs;

    const result = await invites.createInvite({
      email,
      tenantId: ctx.tenantId,
      groupId: groupId as 'tenant-admin' | 'tenant-member',
      createdBy: ctx.userId,
      ttlMs: effectiveTtlMs,
    });

    const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
    const protocol = cookieOpts.cookieSecure ? 'https' : 'http';
    const activationUrl = `${protocol}://${host}/activate?token=${result.activationToken}`;

    return reply.code(201).send({ inviteId: result.inviteId, activationUrl });
  });

  // ── POST /auth/invites/:id/revoke ────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/auth/invites/:id/revoke', {
    schema: { tags: ['Auth'], summary: 'Revoke a pending invite (admin only)' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.INVITES_WRITE))) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const ctx = request.userAuthContext!;
    // Tenant-ownership guard: only revoke invites belonging to the admin's
    // tenant. Without this an admin of tenant A could revoke tenant B's invite
    // by guessing the id. 404 to avoid cross-tenant existence leakage.
    const invite = await invites.findById(request.params.id);
    if (!invite || invite.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: 'Not found', message: 'Invite not found' });
    }

    await invites.revoke(request.params.id);
    return reply.send({ ok: true });
  });

  // ── GET /auth/invites ────────────────────────────────────────────────────────
  app.get('/auth/invites', {
    schema: { tags: ['Auth'], summary: 'List invites for the tenant (admin only)' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.INVITES_READ))) {return;}

    const ctx = request.userAuthContext!;
    const all = await invites.listByTenant(ctx.tenantId);
    return reply.send({ invites: all });
  });

  // ── GET /auth/users ──────────────────────────────────────────────────────────
  app.get('/auth/users', {
    schema: { tags: ['Auth'], summary: 'List users for the tenant (admin only)' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.USERS_READ))) {return;}

    const ctx = request.userAuthContext!;
    const all = await users.listByTenant(ctx.tenantId);
    return reply.send({
      users: all.map((u) => ({
        userId: u.userId,
        email: u.email,
        tenantId: u.tenantId,
        status: u.status,
      })),
    });
  });

  // ── POST /auth/users/:id/disable ────────────────────────────────────────────
  // CD-1: user-auth-middleware checks user.status on every request, so this
  //       takes effect immediately without waiting for token expiry.
  app.post<{ Params: { id: string } }>('/auth/users/:id/disable', {
    schema: { tags: ['Auth'], summary: 'Disable a user account (immediate via CD-1)' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.USERS_WRITE))) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const ctx = request.userAuthContext!;
    const { id } = request.params;
    const target = await users.getById(id);
    // Tenant-ownership guard: an admin may only act on users in their own
    // tenant. requirePermission only proves "you are an admin of ctx.tenantId",
    // not that the target belongs there. Return 404 (not 403) so we don't leak
    // the existence of users in other tenants.
    if (!target || target.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: 'Not found', message: 'User not found' });
    }

    await users.setStatus(id, 'disabled');
    await sessions.revokeAllUserSessions(id);

    return reply.send({ ok: true });
  });

  // ── POST /auth/users/:id/enable ─────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/auth/users/:id/enable', {
    schema: { tags: ['Auth'], summary: 'Re-enable a disabled user account' },
  }, async (request, reply) => {
    if (!(await requirePermission(request, reply, PERMISSIONS.USERS_WRITE))) {return;}
    if (!checkCsrf(request, reply)) {return;}

    const ctx = request.userAuthContext!;
    const { id } = request.params;
    const target = await users.getById(id);
    // Tenant-ownership guard (see /disable). 404 to avoid cross-tenant leakage.
    if (!target || target.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: 'Not found', message: 'User not found' });
    }

    await users.setStatus(id, 'active');
    return reply.send({ ok: true });
  });
}
