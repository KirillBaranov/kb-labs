/**
 * kb webhook list — List declared webhook endpoints.
 *
 * Calls GET /api/v1/webhooks and shows all available webhook declarations,
 * with provisioned status for each.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type ListFlags = {
  plugin: { type: 'string'; description: string };
  json: { type: 'boolean'; description: string };
};

type WebhookEntry = {
  pluginId: string;
  event: string;
  multi: boolean;
  provisioned: boolean;
};

type ListResult = CommandResult & {
  webhooks?: WebhookEntry[];
};

export const webhookList = defineSystemCommand<ListFlags, ListResult>({
  name: 'list',
  description: 'List declared webhook endpoints',
  longDescription:
    'Lists all webhook endpoints declared in installed plugin manifests. ' +
    'Shows provisioned status (whether a secret has been set) for each endpoint.',
  category: 'webhook',
  examples: [
    'kb webhook list',
    'kb webhook list --plugin @kb-labs/rollout',
    'kb webhook list --json',
  ],
  flags: {
    plugin: { type: 'string', description: 'Filter by plugin ID' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const credentialsManager = new CredentialsManager();
    const credentials = await credentialsManager.load();

    if (!credentials) {
      const msg = 'Not authenticated. Run "kb auth login" first.';
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const qs = flags.plugin ? `?pluginId=${encodeURIComponent(flags.plugin)}` : '';
    const url = `${credentials.gatewayUrl}/api/v1/webhooks${qs}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
    } catch (err) {
      const msg = `Cannot reach Gateway at ${credentials.gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const msg = `List failed (HTTP ${response.status}): ${body}`;
      if (flags.json) { ctx.ui?.json({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
      return { ok: false, error: msg };
    }

    const data = await response.json() as { webhooks: WebhookEntry[] };
    const webhooks = data.webhooks ?? [];

    if (flags.json) {
      ctx.ui?.json({ ok: true, webhooks });
    } else {
      if (webhooks.length === 0) {
        ctx.ui?.write?.('No webhook endpoints found.\n');
      } else {
        // Column widths
        const pluginWidth = Math.max(6, ...webhooks.map((w) => w.pluginId.length));
        const eventWidth = Math.max(5, ...webhooks.map((w) => w.event.length));

        // Header
        ctx.ui?.write?.(
          `${'PLUGIN'.padEnd(pluginWidth)}  ${'EVENT'.padEnd(eventWidth)}  MULTI  PROVISIONED\n`,
        );
        ctx.ui?.write?.(`${'─'.repeat(pluginWidth)}  ${'─'.repeat(eventWidth)}  ─────  ───────────\n`);

        for (const w of webhooks) {
          ctx.ui?.write?.(
            `${w.pluginId.padEnd(pluginWidth)}  ${w.event.padEnd(eventWidth)}  ${w.multi ? 'yes  ' : 'no   '}  ${w.provisioned ? 'yes' : 'no'}\n`,
          );
        }
        ctx.ui?.write?.(`\n${webhooks.length} webhook(s)\n`);
      }
    }

    return { ok: true, webhooks };
  },
});
