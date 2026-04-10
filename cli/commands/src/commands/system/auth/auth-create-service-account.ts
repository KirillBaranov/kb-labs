/**
 * kb auth create-service-account — Register a new service account with Gateway.
 *
 * Calls POST /auth/register to create clientId + clientSecret.
 * These are printed to stdout and should be saved securely.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';

type CreateSAFlags = {
  'gateway-url': { type: 'string'; description: string };
  name: { type: 'string'; description: string };
  'namespace-id': { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type CreateSAResult = CommandResult & {
  clientId?: string;
  clientSecret?: string;
  hostId?: string;
};

export const authCreateServiceAccount = defineSystemCommand<CreateSAFlags, CreateSAResult>({
  name: 'create-service-account',
  description: 'Register a new service account with Gateway',
  longDescription:
    'Creates a new client registration in Gateway and returns clientId + clientSecret. ' +
    'Use these credentials with "kb auth login" to authenticate.',
  category: 'auth',
  examples: [
    'kb auth create-service-account --gateway-url http://localhost:4000 --name my-cli --namespace-id default',
    'kb auth create-service-account --gateway-url http://localhost:4000 --name ci-agent --namespace-id default --json',
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
      const msg = 'All flags required: --gateway-url, --name, --namespace-id';
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg };
    }

    let response: Response;
    try {
      response = await fetch(`${gatewayUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, namespaceId }),
      });
    } catch (err) {
      const msg = `Cannot reach Gateway at ${gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const msg = `Registration failed (HTTP ${response.status}): ${body}`;
      if (flags.json) {
        ctx.ui?.json({ ok: false, error: msg });
      } else {
        ctx.ui?.error?.(msg);
      }
      return { ok: false, error: msg };
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
