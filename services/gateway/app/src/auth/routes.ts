/**
 * Auth routes — machine-client endpoints for agent registration and token management.
 *
 * POST /auth/register  — register new agent, get clientId + clientSecret
 *                        (gated behind MACHINE_REGISTER permission; see gate below)
 * POST /auth/token     — exchange credentials for JWT pair
 * POST /auth/refresh   — rotate refresh token (machine body path); user cookie
 *                        path is handled first if userRefreshFn is provided
 *
 * NOTE: GET /auth/me is NOT registered here — it lives in registerUserAuthRoutes
 * because it must handle both user-cookie and machine-Bearer contexts in one handler.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService, IPolicyDecisionPoint } from '@kb-labs/gateway-auth';
import {
  RegisterRequestSchema,
  TokenRequestSchema,
  RefreshRequestSchema,
} from '@kb-labs/gateway-contracts';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import { COOKIE_REFRESH } from './user-cookies.js';

export interface MachineAuthRoutesUserExt {
  /** Called when a user refresh cookie is detected in POST /auth/refresh.
   *  Must write the reply and return true; return false to fall through to
   *  the machine body-refresh path. */
  userRefreshFn: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
  /** PDP for checking MACHINE_REGISTER permission on cookie-authenticated admin users. */
  pdp: IPolicyDecisionPoint;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
  userExt?: MachineAuthRoutesUserExt,
): void {
  // Register new agent.
  // Requires MACHINE_REGISTER permission. Auth checks:
  //   - Anonymous (no cookie, no Bearer) → 401 from machine-auth middleware
  //   - Cookie-auth user without permission → 403 (PDP check below)
  //   - Cookie-auth admin with MACHINE_REGISTER → 200
  //   - Bearer-auth machine with machine:register in JWT permissions → 200
  app.post('/auth/register', { schema: { tags: ['Auth'], summary: 'Register new agent and get credentials' } }, async (request, reply) => {
    // Gate behind MACHINE_REGISTER permission.
    // Two auth paths: cookie-authenticated user (userAuthContext) or Bearer machine (authContext).
    const userCtx = request.userAuthContext;
    const machineCtx = request.authContext;

    if (userCtx && userExt?.pdp) {
      // Cookie-authenticated user — check via PDP.
      const decision = await userExt.pdp.check(
        { userId: userCtx.userId, tenantId: userCtx.tenantId, type: 'user' },
        PERMISSIONS.MACHINE_REGISTER,
      );
      if (!decision.allow) {
        return reply.code(403).send({ error: 'Forbidden', message: `Permission denied: ${PERMISSIONS.MACHINE_REGISTER}` });
      }
    } else if (machineCtx) {
      // Bearer-authenticated machine — check permissions embedded in JWT.
      if (!machineCtx.permissions.includes(PERMISSIONS.MACHINE_REGISTER)) {
        return reply.code(403).send({ error: 'Forbidden', message: `Permission denied: ${PERMISSIONS.MACHINE_REGISTER}` });
      }
    } else {
      // No auth context at all (should have been caught by middleware, but guard defensively).
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
    }

    const { name, capabilities, publicKey, handle, email } = parsed.data;
    try {
      const result = await authService.register({ name, capabilities, publicKey, handle, email });
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'HANDLE_TAKEN') {
        return reply.code(409).send({ error: 'Conflict', message: err.message });
      }
      throw err;
    }
  });

  // Issue token pair (machine credentials → JWT pair).
  app.post('/auth/token', { schema: { tags: ['Auth'], summary: 'Issue JWT token pair' } }, async (request, reply) => {
    const parsed = TokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
    }

    const tokens = await authService.issueTokens(parsed.data.clientId, parsed.data.clientSecret);
    if (!tokens) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    return reply.send(tokens);
  });

  // Refresh token pair.
  // If a user refresh cookie is detected AND userExt.userRefreshFn is provided,
  // the user path is handled first. Otherwise, falls back to machine body refresh.
  app.post('/auth/refresh', { schema: { tags: ['Auth'], summary: 'Refresh JWT token pair (machine or user)' } }, async (request, reply) => {
    // User cookie refresh — handled by the user-auth subsystem if wired.
    const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
    const refreshCookie = cookies?.[COOKIE_REFRESH];
    if (refreshCookie && userExt) {
      const handled = await userExt.userRefreshFn(request, reply);
      if (handled) {return;}
    }

    // Machine body refresh (existing logic).
    const parsed = RefreshRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
    }

    const tokens = await authService.refreshTokens(parsed.data.refreshToken);
    if (!tokens) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }

    return reply.send(tokens);
  });
}
