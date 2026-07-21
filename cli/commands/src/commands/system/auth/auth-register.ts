/**
 * kb auth register — Register a new service account with Gateway.
 *
 * Calls POST /auth/register to create clientId + clientSecret.
 * These are printed to stdout and should be saved securely.
 *
 * Not self-service: /auth/register requires the caller to already be
 * authenticated as an admin with MACHINE_REGISTER (see
 * services/gateway/auth/README.md). This command prefers a stored human
 * session (~/.kb/session.json, set by "kb auth login --email/--password")
 * as its Bearer token — that's the identity that actually carries
 * MACHINE_REGISTER (see services/gateway/auth/src/stub-pdp.ts). It falls
 * back to stored machine credentials (~/.kb/credentials.json, set by
 * "kb auth login --client-id/--client-secret") only when no session exists,
 * for callers whose machine token happens to carry the permission. Log in
 * as the bootstrap admin first (printed once by `kb-create`, or in .env /
 * GATEWAY_BOOTSTRAP_ADMIN_PASSWORD).
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager, SessionManager } from '@kb-labs/cli-runtime/gateway';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

type RegisterFlags = {
  'gateway-url': { type: 'string'; description: string };
  name: { type: 'string'; description: string };
  'namespace-id': { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type RegisterResult = CommandResult & {
  clientId?: string;
  clientSecret?: string;
  hostId?: string;
};

/** Sends the same {ok:false, error} shape whether --json is set or not, and returns it. */
function fail(ctx: PluginContextV3, json: boolean | undefined, msg: string): RegisterResult {
  if (json) {
    ctx.ui?.json({ ok: false, error: msg });
  } else {
    ctx.ui?.error?.(msg);
  }
  return { ok: false, error: msg };
}

/**
 * Resolves the Bearer token to call /auth/register with: a stored human
 * session first (it's the identity that actually carries MACHINE_REGISTER),
 * falling back to stored machine credentials when no session exists.
 * Refreshes either store proactively if its token is expired.
 */
async function resolveBearerToken(
  ctx: PluginContextV3,
  json: boolean | undefined,
): Promise<{ token: string } | { error: RegisterResult }> {
  const sessionManager = new SessionManager();
  const session = await sessionManager.load();
  if (session) {
    if (!sessionManager.isExpired(session)) {
      return { token: session.accessToken };
    }
    try {
      const refreshed = await sessionManager.refresh(session);
      return { token: refreshed.accessToken };
    } catch (err) {
      const msg = `Stored session expired and refresh failed: ${err instanceof Error ? err.message : String(err)}. Run "kb auth login --email/--password" again.`;
      return { error: fail(ctx, json, msg) };
    }
  }

  const credentialsManager = new CredentialsManager();
  const credentials = await credentialsManager.load();
  if (!credentials) {
    const msg = 'Not authenticated. Run "kb auth login" first — /auth/register requires an authenticated admin (MACHINE_REGISTER permission), it is not self-service.';
    return { error: fail(ctx, json, msg) };
  }
  if (!credentialsManager.isExpired(credentials)) {
    return { token: credentials.accessToken };
  }
  try {
    const refreshed = await credentialsManager.refresh(credentials);
    return { token: refreshed.accessToken };
  } catch (err) {
    const msg = `Stored credentials expired and refresh failed: ${err instanceof Error ? err.message : String(err)}. Run "kb auth login" again.`;
    return { error: fail(ctx, json, msg) };
  }
}

export const authRegister = defineSystemCommand<RegisterFlags, RegisterResult>({
  name: 'register',
  description: 'Register a new service account with Gateway',
  longDescription:
    'Creates a new client registration in Gateway and returns clientId + clientSecret. ' +
    'Use these credentials with "kb auth login" to authenticate.',
  category: 'auth',
  examples: [
    'kb auth register --gateway-url http://localhost:4000 --name my-cli --namespace-id default',
    'kb auth register --gateway-url http://localhost:4000 --name ci-agent --namespace-id default --json',
  ],
  flags: {
    'gateway-url': { type: 'string', description: 'Gateway server URL' },
    name: { type: 'string', description: 'Service account name (1-64 chars)' },
    'namespace-id': { type: 'string', description: 'Namespace ID (1-64 chars)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const gatewayUrl = flags['gateway-url'];
    const name = flags.name;
    const namespaceId = flags['namespace-id'];

    if (!gatewayUrl || !name || !namespaceId) {
      return fail(ctx, flags.json, 'All flags required: --gateway-url, --name, --namespace-id');
    }

    const resolved = await resolveBearerToken(ctx, flags.json);
    if ('error' in resolved) {
      return resolved.error;
    }
    const accessToken = resolved.token;

    let response: Response;
    try {
      response = await fetch(`${gatewayUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name, namespaceId }),
      });
    } catch (err) {
      return fail(ctx, flags.json, `Cannot reach Gateway at ${gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let msg = `Registration failed (HTTP ${response.status}): ${body}`;
      if (response.status === 401 || response.status === 403) {
        msg += '\n/auth/register requires an authenticated admin (MACHINE_REGISTER permission) — ' +
          'it is not self-service. Log in as the bootstrap admin first.';
      }
      return fail(ctx, flags.json, msg);
    }

    const data = await response.json() as {
      clientId: string;
      clientSecret: string;
      hostId: string;
    };

    if (flags.json) {
      ctx.ui?.json({
        ok: true,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        hostId: data.hostId,
      });
    } else {
      ctx.ui?.write?.('Service account created successfully.\n\n');
      ctx.ui?.write?.(`  Client ID:     ${data.clientId}\n`);
      ctx.ui?.write?.(`  Client Secret: ${data.clientSecret}\n`);
      ctx.ui?.write?.(`  Host ID:       ${data.hostId}\n\n`);
      ctx.ui?.write?.('Save these credentials securely — the secret is shown only once.\n\n');
      ctx.ui?.write?.('To authenticate:\n');
      ctx.ui?.write?.(`  kb auth login --gateway-url ${gatewayUrl} --client-id ${data.clientId} --client-secret ${data.clientSecret}\n`);
    }

    return { ok: true, clientId: data.clientId, clientSecret: data.clientSecret, hostId: data.hostId };
  },
});
