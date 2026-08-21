/**
 * kb auth login — Authenticate CLI with Gateway.
 *
 * Two identities, one command:
 * - `--client-id`/`--client-secret` (machine): exchanges credentials for a
 *   JWT pair via POST /auth/token, saves to ~/.kb/credentials.json.
 * - `--email`/`--password` (human): exchanges credentials for a JWT pair via
 *   POST /auth/login/cli (the CLI-only, no-cookies analogue of the browser
 *   /auth/login — see services/gateway/app/src/auth/user-routes.ts), saves
 *   to ~/.kb/session.json via SessionManager. This is what lets admin-gated
 *   actions like "kb auth register" work from the CLI at all — a machine
 *   token alone can never carry MACHINE_REGISTER (see auth-register.ts).
 *
 * Both branches auto-refresh on expiry and chmod their store 0o600.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager, hasLocalRuntimeState, resolveLocalGatewayUrl, SessionManager } from '@kb-labs/cli-runtime/gateway';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

type LoginFlags = {
  'gateway-url': { type: 'string'; description: string };
  'client-id': { type: 'string'; description: string };
  'client-secret': { type: 'string'; description: string };
  email: { type: 'string'; description: string };
  password: { type: 'string'; description: string };
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
    'Machine identity: exchange --client-id/--client-secret for JWT tokens, saved to ' +
    '~/.kb/credentials.json. Use "kb auth register" to create credentials first. ' +
    'Human identity: exchange --email/--password for JWT tokens, saved to ' +
    '~/.kb/session.json. Both auto-refresh on expiry.',
  category: 'auth',
  examples: [
    'kb auth login --gateway-url http://localhost:4000 --client-id clt_xxx --client-secret cs_xxx',
    'kb auth login --gateway-url http://localhost:4000 --email admin@example.com --password ***',
    'kb auth login --gateway-url https://gateway.example.com --client-id clt_xxx --client-secret cs_xxx --json',
  ],
  flags: {
    'gateway-url': { type: 'string', description: 'Gateway server URL (e.g. http://localhost:4000)' },
    'client-id': { type: 'string', description: 'Client ID from service account registration' },
    'client-secret': { type: 'string', description: 'Client Secret from service account registration' },
    email: { type: 'string', description: 'Email for human (admin) login' },
    password: { type: 'string', description: 'Password for human (admin) login' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async handler(ctx, _argv, flags) {
    const gatewayUrl = flags['gateway-url'] ?? (hasLocalRuntimeState() ? resolveLocalGatewayUrl() : undefined);
    const clientId = flags['client-id'];
    const clientSecret = flags['client-secret'];
    const email = flags.email;
    const password = flags.password;

    if (!gatewayUrl) {
      const msg = '--gateway-url is required, plus either --client-id/--client-secret or --email/--password';
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg, gatewayUrl: '', expiresIn: 0 };
    }

    if (email && password) {
      return humanLogin(ctx, flags, gatewayUrl, email, password);
    }

    if (!clientId || !clientSecret) {
      const msg = 'Provide either --client-id/--client-secret (machine) or --email/--password (human)';
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

    // Fetch profile (handle, namespaceId) via /auth/me
    let handle: string | undefined;
    let namespaceId: string | undefined;
    try {
      const meRes = await fetch(`${gatewayUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${tokenData.accessToken}` },
      });
      if (meRes.ok) {
        const profile = await meRes.json() as { handle?: string; namespaceId?: string };
        handle = profile.handle;
        namespaceId = profile.namespaceId;
      }
    } catch {
      // /auth/me failure is non-fatal — credentials still saved without profile
    }

    // Save credentials
    const credentialsManager = new CredentialsManager();
    const expiresAt = Date.now() + tokenData.expiresIn * 1000;

    await credentialsManager.save({
      gatewayUrl,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt,
      handle,
      namespaceId,
    });

    if (flags.json) {
      ctx.ui?.json({
        ok: true,
        gatewayUrl,
        expiresIn: tokenData.expiresIn,
        ...(handle ? { handle } : {}),
      });
    } else {
      ctx.ui?.write?.(`Authenticated with Gateway at ${gatewayUrl}\n`);
      if (handle) { ctx.ui?.write?.(`Handle: ${handle}\n`); }
      ctx.ui?.write?.(`Token expires in ${Math.floor(tokenData.expiresIn / 60)} minutes (auto-refresh enabled).\n`);
    }

    return { ok: true, gatewayUrl, expiresIn: tokenData.expiresIn };
  },
});

/** Human (email/password) login branch — see the module docblock. */
async function humanLogin(
  ctx: PluginContextV3,
  flags: { json?: boolean },
  gatewayUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  let loginResponse: Response;
  try {
    loginResponse = await fetch(`${gatewayUrl}/auth/login/cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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

  if (!loginResponse.ok) {
    const body = await loginResponse.text().catch(() => '');
    const msg = `Authentication failed (HTTP ${loginResponse.status}): ${body}`;
    if (flags.json) {
      ctx.ui?.json({ ok: false, error: msg });
    } else {
      ctx.ui?.error?.(msg);
    }
    return { ok: false, error: msg, gatewayUrl, expiresIn: 0 };
  }

  const loginData = await loginResponse.json() as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tenantId?: string;
  };

  // Fetch profile via /auth/me for parity with the machine branch — non-fatal
  // on failure, the session is still saved without a resolved email/tenantId.
  let profileEmail: string | undefined = email;
  let tenantId: string | undefined = loginData.tenantId;
  try {
    const meRes = await fetch(`${gatewayUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.accessToken}` },
    });
    if (meRes.ok) {
      const profile = await meRes.json() as { email?: string; tenantId?: string };
      profileEmail = profile.email ?? profileEmail;
      tenantId = profile.tenantId ?? tenantId;
    }
  } catch {
    // /auth/me failure is non-fatal — session still saved without profile
  }

  const sessionManager = new SessionManager();
  const expiresAt = Date.now() + loginData.expiresIn * 1000;

  await sessionManager.save({
    gatewayUrl,
    accessToken: loginData.accessToken,
    refreshToken: loginData.refreshToken,
    expiresAt,
    email: profileEmail,
    tenantId,
  });

  if (flags.json) {
    ctx.ui?.json({
      ok: true,
      gatewayUrl,
      expiresIn: loginData.expiresIn,
      ...(profileEmail ? { email: profileEmail } : {}),
      ...(tenantId ? { tenantId } : {}),
    });
  } else {
    ctx.ui?.write?.(`Authenticated with Gateway at ${gatewayUrl}\n`);
    if (profileEmail) { ctx.ui?.write?.(`Email: ${profileEmail}\n`); }
    ctx.ui?.write?.(`Token expires in ${Math.floor(loginData.expiresIn / 60)} minutes (auto-refresh enabled).\n`);
  }

  return { ok: true, gatewayUrl, expiresIn: loginData.expiresIn };
}
