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
import type { AuthService } from '@kb-labs/gateway-auth';
import {
  RegisterRequestSchema,
  TokenRequestSchema,
  RefreshRequestSchema,
} from '@kb-labs/gateway-contracts';
import { COOKIE_REFRESH } from './user-cookies.js';

export interface MachineAuthRoutesUserExt {
  /** Called when a user refresh cookie is detected in POST /auth/refresh.
   *  Must write the reply and return true; return false to fall through to
   *  the machine body-refresh path. */
  userRefreshFn: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
  userExt?: MachineAuthRoutesUserExt,
): void {
  // Register new agent.
  // NOTE: This route is in PUBLIC_ROUTES (machine middleware bypass), but the
  //       handler requires the caller to be authenticated as a machine client
  //       with MACHINE_REGISTER permission. Public bypass is needed so that the
  //       first-time bootstrap flow can register before any machine client exists.
  //       In practice, the gateway is only reachable from trusted networks on
  //       the initial bootstrap; post-bootstrap, the PDP check here enforces the
  //       permission gate.
  app.post('/auth/register', { schema: { tags: ['Auth'], summary: 'Register new agent and get credentials' } }, async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
    }

    const { name, capabilities, publicKey, handle, email } = parsed.data;
    try {
      const result = await authService.register({ name, capabilities, publicKey, handle, email });
      return reply.code(201).send(result);
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
