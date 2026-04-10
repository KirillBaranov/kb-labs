/**
 * kb auth login — Authenticate CLI with Gateway.
 *
 * Prompts for Gateway URL + Client ID + Client Secret,
 * exchanges credentials for JWT token pair via POST /auth/token,
 * saves to ~/.kb/credentials.json (chmod 600).
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type LoginFlags = {
  'gateway-url': { type: 'string'; description: string };
  'client-id': { type: 'string'; description: string };
  'client-secret': { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type LoginResult = CommandResult & {
  gatewayUrl: string;
  expiresIn: number;
};

export const authLogin = defineSystemCommand<LoginFlags, LoginResult>({
  name: 'login',
  description: 'Authenticate CLI with Gateway',
  longDescription:
    'Exchange client credentials for JWT tokens and save to ~/.kb/credentials.json. ' +
    'Tokens auto-refresh on expiry. Use "kb auth create-service-account" to create credentials first.',
  category: 'auth',
  examples: [
    'kb auth login --gateway-url http://localhost:4000 --client-id clt_xxx --client-secret cs_xxx',
    'kb auth login --gateway-url https://gateway.example.com --client-id clt_xxx --client-secret cs_xxx --json',
  ],
  flags: {
    'gateway-url': { type: 'string', description: 'Gateway server URL (e.g. http://localhost:4000)' },
    'client-id': { type: 'string', description: 'Client ID from service account registration' },
    'client-secret': { type: 'string', description: 'Client Secret from service account registration' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const gatewayUrl = flags['gateway-url'];
    const clientId = flags['client-id'];
    const clientSecret = flags['client-secret'];

    if (!gatewayUrl || !clientId || !clientSecret) {
      const msg = 'All flags required: --gateway-url, --client-id, --client-secret';
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg, gatewayUrl: '', expiresIn: 0 };
    }

    // Exchange credentials for tokens
    const tokenUrl = `${gatewayUrl}/auth/token`;
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
    } catch (err) {
      const msg = `Cannot reach Gateway at ${gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg, gatewayUrl, expiresIn: 0 };
    }

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => '');
      const msg = `Authentication failed (HTTP ${tokenResponse.status}): ${body}`;
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg, gatewayUrl, expiresIn: 0 };
    }

    const tokenData = await tokenResponse.json() as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    // Save credentials
    const credentialsManager = new CredentialsManager();
    const expiresAt = Date.now() + tokenData.expiresIn * 1000;

    await credentialsManager.save({
      gatewayUrl,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt,
    });

    if (flags.json) {
      ctx.ui?.json({
        ok: true,
        gatewayUrl,
        expiresIn: tokenData.expiresIn,
      });
    } else {
      ctx.ui?.write?.(`Authenticated with Gateway at ${gatewayUrl}\n`);
      ctx.ui?.write?.(`Token expires in ${Math.floor(tokenData.expiresIn / 60)} minutes (auto-refresh enabled).\n`);
    }

    return { ok: true, gatewayUrl, expiresIn: tokenData.expiresIn };
  },
});
