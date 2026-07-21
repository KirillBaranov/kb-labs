/**
 * kb auth status — Show current Gateway authentication status.
 *
 * Reports both identity stores: machine credentials (~/.kb/credentials.json)
 * and a human session (~/.kb/session.json) — a caller with only one of the
 * two would otherwise get a misleadingly incomplete picture now that both
 * exist. Top-level `authenticated`/`gatewayUrl`/`tokenExpired`/`expiresAt`
 * describe the machine store (unchanged shape, for existing --json
 * consumers); `session` describes the human store.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager, SessionManager } from '@kb-labs/cli-runtime/gateway';

type StatusFlags = {
  json: { type: 'boolean'; description: string };
};

type SessionStatus = {
  authenticated: boolean;
  gatewayUrl?: string;
  tokenExpired?: boolean;
  expiresAt?: string;
  email?: string;
};

type StatusResult = CommandResult & {
  authenticated: boolean;
  gatewayUrl?: string;
  tokenExpired?: boolean;
  expiresAt?: string;
  session: SessionStatus;
};

export const authStatus = defineSystemCommand<StatusFlags, StatusResult>({
  name: 'status',
  description: 'Show Gateway authentication status',
  longDescription: 'Displays current machine credentials and human session status, token expiry, and Gateway URL.',
  category: 'auth',
  examples: [
    'kb auth status',
    'kb auth status --json',
  ],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const credentialsManager = new CredentialsManager();
    const sessionManager = new SessionManager();
    const [credentials, session] = await Promise.all([
      credentialsManager.load(),
      sessionManager.load(),
    ]);

    const sessionStatus: SessionStatus = session
      ? {
        authenticated: true,
        gatewayUrl: session.gatewayUrl,
        tokenExpired: sessionManager.isExpired(session),
        expiresAt: new Date(session.expiresAt).toISOString(),
        email: session.email,
      }
      : { authenticated: false };

    if (!credentials) {
      if (flags.json) {
        ctx.ui?.json({ ok: true, authenticated: false, session: sessionStatus });
      } else {
        if (session) {
          ctx.ui?.write?.(`Session (human): ${session.email ?? session.gatewayUrl}${sessionStatus.tokenExpired ? ' — token expired (will auto-refresh)' : ''}\n`);
        } else {
          ctx.ui?.write?.('Not authenticated. Run "kb auth login" to configure Gateway connection.\n');
        }
      }
      return { ok: true, authenticated: false, session: sessionStatus };
    }

    const expired = credentialsManager.isExpired(credentials);
    const expiresAt = new Date(credentials.expiresAt).toISOString();
    const timeLeft = credentials.expiresAt - Date.now();
    const minutesLeft = Math.max(0, Math.floor(timeLeft / 60000));

    if (flags.json) {
      ctx.ui?.json({
        ok: true,
        authenticated: true,
        gatewayUrl: credentials.gatewayUrl,
        tokenExpired: expired,
        expiresAt,
        minutesLeft,
        session: sessionStatus,
      });
    } else {
      ctx.ui?.write?.(`Machine credentials: ${credentials.gatewayUrl}\n`);
      if (expired) {
        ctx.ui?.write?.(`  Token: expired (will auto-refresh on next request)\n`);
      } else {
        ctx.ui?.write?.(`  Token: valid (expires in ${minutesLeft} min)\n`);
      }
      if (session) {
        ctx.ui?.write?.(`Session (human): ${session.email ?? session.gatewayUrl}\n`);
        ctx.ui?.write?.(`  Token: ${sessionStatus.tokenExpired ? 'expired (will auto-refresh)' : 'valid'}\n`);
      }
    }

    return {
      ok: true,
      authenticated: true,
      gatewayUrl: credentials.gatewayUrl,
      tokenExpired: expired,
      expiresAt,
      session: sessionStatus,
    };
  },
});
