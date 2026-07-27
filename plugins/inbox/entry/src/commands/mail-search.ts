import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, searchMessages } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';
import { formatDate, formatFrom } from '../utils/slim.js';

type SearchFlags = {
  from?: string;
  subject?: string;
  body?: string;
  text?: string;
  folder?: string;
  since?: string;
  limit?: number;
  account?: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.search',
  description: 'Search emails by from, subject, body, or text',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SearchFlags>) {
      try {
        const account = resolveAccount(input.flags.account);
        const since = input.flags.since ? parseSince(input.flags.since) : undefined;

        const messages = await searchMessages(account, {
          from: input.flags.from,
          subject: input.flags.subject,
          body: input.flags.body,
          text: input.flags.text,
          folder: input.flags.folder,
          since,
          limit: input.flags.limit ?? 20,
        });

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: messages });
          return { ok: true, result: messages };
        }

        if (!messages.length) {
          ctx.ui?.info?.('No messages found.');
          return { ok: true, result: messages };
        }

        ctx.ui?.chain?.(messages.map(msg => ({
          title: `[${msg.uid}] ${msg.unread ? '● ' : ''}${msg.subject}`,
          sections: [{
            items: [
              `from: ${formatFrom(msg.from)}  ${formatDate(msg.date)}  folder: ${msg.folder}`,
            ],
          }],
        })));

        return { ok: true, result: messages };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});

function parseSince(raw: string): Date {
  const match = raw.match(/^(\d+)(h|d|w)$/i);
  if (match) {
    const n = parseInt(match[1] ?? '0', 10);
    const unit = (match[2] ?? 'h').toLowerCase();
    const ms = unit === 'h' ? n * 3_600_000 : unit === 'd' ? n * 86_400_000 : n * 7 * 86_400_000;
    return new Date(Date.now() - ms);
  }
  return new Date(raw);
}
