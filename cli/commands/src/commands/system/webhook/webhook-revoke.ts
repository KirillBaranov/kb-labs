/**
 * kb webhook revoke — Revoke a provisioned webhook secret.
 *
 * Calls DELETE /api/v1/webhooks/:pluginId/:event[/:instanceId].
 * After revocation, incoming deliveries with the old secret are rejected immediately.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type RevokeFlags = {
  plugin: { type: 'string'; description: string };
  event: { type: 'string'; description: string };
  instance: { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type RevokeResult = CommandResult;

export const webhookRevoke = defineSystemCommand<RevokeFlags, RevokeResult>({
  name: 'revoke',
  description: 'Revoke a provisioned webhook secret',
  longDescription:
    'Deletes the webhook secret for a plugin+event combination. ' +
    'Any subsequent deliveries with the old secret are immediately rejected (no grace period). ' +
    'Use "kb webhook provision" to create a new secret afterwards.',
  category: 'webhook',
  examples: [
    'kb webhook revoke --plugin @kb-labs/rollout --event alert',
    'kb webhook revoke --plugin @kb-labs/rollout --event alert --instance prod',
    'kb webhook revoke --plugin @kb-labs/rollout --event alert --json',
  ],
  flags: {
    plugin: { type: 'string', description: 'Plugin ID (e.g. @kb-labs/rollout)' },
    event: { type: 'string', description: 'Webhook event name' },
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

    // Build path: encode each segment to handle scoped package names (@org/pkg)
    const segments = [
      encodeURIComponent(pluginId),
      encodeURIComponent(event),
      ...(flags.instance ? [encodeURIComponent(flags.instance)] : []),
    ].join('/');
    const url = `${credentials.gatewayUrl}/api/v1/webhooks/${segments}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
    } catch (err) {
      const msg = `Cannot reach Gateway at ${credentials.gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    // 204 = revoked, 404 = not found (idempotent — treat as ok)
    if (!response.ok && response.status !== 404) {
      const body = await response.text().catch(() => '');
      const msg = `Revoke failed (HTTP ${response.status}): ${body}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const label = flags.instance
      ? `${pluginId}/${event}/${flags.instance}`
      : `${pluginId}/${event}`;

    if (flags.json) {
      ctx.ui?.json({ ok: true, revoked: label });
    } else {
      ctx.ui?.write?.(`✓  Webhook revoked: ${label}\n`);
    }

    return { ok: true };
  },
});
