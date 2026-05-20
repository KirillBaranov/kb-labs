import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, listMessages } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';
import { formatDate, formatFrom } from '../utils/slim.js';

type ListFlags = {
  folder?: string;
  unread?: boolean;
  since?: string;
  limit?: number;
  account?: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.list',
  description: 'List emails in a folder',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ListFlags>) {
      try {
        const account = resolveAccount(input.flags.account);
        const since = input.flags.since ? parseSince(input.flags.since) : undefined;

        const messages = await listMessages(account, {
          folder: input.flags.folder ?? 'INBOX',
          unreadOnly: input.flags.unread,
          since,
          limit: input.flags.limit ?? 50,
        });

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: messages });
          return { exitCode: 0, result: messages };
        }

        if (!messages.length) {
          ctx.ui?.info?.('No messages found.');
          return { exitCode: 0, result: messages };
        }

        ctx.ui?.chain?.(messages.map(msg => ({
          title: `[${msg.uid}] ${msg.unread ? '● ' : ''}${msg.subject}`,
          sections: [{
            items: [
              `from: ${formatFrom(msg.from)}  ${formatDate(msg.date)}`,
              `${msg.flagged ? '⚑ flagged  ' : ''}${msg.hasAttachments ? '📎 attachment  ' : ''}folder: ${msg.folder}`,
            ],
          }],
        })));

        return { exitCode: 0, result: messages };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});

function parseSince(raw: string): Date {
  // Support: 24h, 7d, 2w or ISO date
  const match = raw.match(/^(\d+)(h|d|w)$/i);
  if (match) {
    const n = parseInt(match[1] ?? '0', 10);
    const unit = (match[2] ?? 'h').toLowerCase();
    const ms = unit === 'h' ? n * 3_600_000 : unit === 'd' ? n * 86_400_000 : n * 7 * 86_400_000;
    return new Date(Date.now() - ms);
  }
  return new Date(raw);
}
