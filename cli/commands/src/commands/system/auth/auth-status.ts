/**
 * kb auth status — Show current Gateway authentication status.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type StatusFlags = {
  json: { type: 'boolean'; description: string };
};

type StatusResult = CommandResult & {
  authenticated: boolean;
  gatewayUrl?: string;
  tokenExpired?: boolean;
  expiresAt?: string;
};

export const authStatus = defineSystemCommand<StatusFlags, StatusResult>({
  name: 'status',
  description: 'Show Gateway authentication status',
  longDescription: 'Displays current credentials, token expiry, and Gateway URL. Optionally pings the Gateway to verify connectivity.',
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
    const credentials = await credentialsManager.load();

    if (!credentials) {
      if (flags.json) {
        ctx.ui?.json({ ok: true, authenticated: false });
      } else {
        ctx.ui?.write?.('Not authenticated. Run "kb auth login" to configure Gateway connection.\n');
      }
      return { ok: true, authenticated: false };
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
      });
    } else {
      ctx.ui?.write?.(`Gateway: ${credentials.gatewayUrl}\n`);
      if (expired) {
        ctx.ui?.write?.(`Token: expired (will auto-refresh on next request)\n`);
      } else {
        ctx.ui?.write?.(`Token: valid (expires in ${minutesLeft} min)\n`);
      }
    }

    return {
      ok: true,
      authenticated: true,
      gatewayUrl: credentials.gatewayUrl,
      tokenExpired: expired,
      expiresAt,
    };
  },
});
