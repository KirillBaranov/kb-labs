/**
 * kb webhook provision — Provision (or rotate) a webhook secret.
 *
 * Calls POST /api/v1/webhooks/provision and prints the URL + secret once.
 * The secret is shown only here — it cannot be recovered after this call.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type ProvisionFlags = {
  plugin: { type: 'string'; description: string };
  event: { type: 'string'; description: string };
  instance: { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type ProvisionResult = CommandResult & {
  url?: string;
  rotated?: boolean;
};

export const webhookProvision = defineSystemCommand<ProvisionFlags, ProvisionResult>({
  name: 'provision',
  description: 'Provision (or rotate) a webhook secret',
  longDescription:
    'Generates a new webhook secret for a plugin+event combination and registers it with the Gateway. ' +
    'On first call: creates the secret. On subsequent calls: rotates it (old secret valid for 24h). ' +
    'The secret is shown once — save it immediately.',
  category: 'webhook',
  examples: [
    'kb webhook provision --plugin @kb-labs/rollout --event alert',
    'kb webhook provision --plugin @kb-labs/rollout --event alert --instance prod',
    'kb webhook provision --plugin @kb-labs/rollout --event alert --json',
  ],
  flags: {
    plugin: { type: 'string', description: 'Plugin ID (e.g. @kb-labs/rollout)' },
    event: { type: 'string', description: 'Webhook event name declared in the plugin manifest' },
    instance: { type: 'string', description: 'Instance ID for multi-instance webhooks (optional)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const pluginId = flags.plugin;
    const event = flags.event;

    if (!pluginId) {
      const msg = '--plugin is required';
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }
    if (!event) {
      const msg = '--event is required';
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const credentialsManager = new CredentialsManager();
    const credentials = await credentialsManager.load();

    if (!credentials) {
      const msg = 'Not authenticated. Run "kb auth login" first.';
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const url = `${credentials.gatewayUrl}/api/v1/webhooks/provision`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body: JSON.stringify({
          pluginId,
          event,
          ...(flags.instance ? { instanceId: flags.instance } : {}),
        }),
      });
    } catch (err) {
      const msg = `Cannot reach Gateway at ${credentials.gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(body)?.message ?? body; } catch { detail = body; }
      const msg = `Provision failed (HTTP ${response.status})${detail ? ': ' + detail : ''}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const data = await response.json() as { url: string; secret: string; rotated: boolean };

    if (flags.json) {
      ctx.ui?.json({ ok: true, url: data.url, secret: data.secret, rotated: data.rotated });
    } else {
      ctx.ui?.write?.(data.rotated ? '⟳  Secret rotated (old secret valid for 24h grace period)\n' : '✓  Webhook provisioned\n');
      ctx.ui?.write?.(`URL:    ${data.url}\n`);
      ctx.ui?.write?.(`Secret: ${data.secret}\n`);
      ctx.ui?.write?.('\n⚠  Save the secret now — it will not be shown again.\n');
    }

    return { ok: true, url: data.url, rotated: data.rotated };
  },
});
