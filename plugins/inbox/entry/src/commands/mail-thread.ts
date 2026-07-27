import { defineCommand, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, getThread } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';
import { formatDate, formatFrom } from '../utils/slim.js';

type ThreadFlags = {
  folder?: string;
  account?: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.thread',
  description: 'Get full email thread by uid',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ThreadFlags>) {
      const [rawUid] = input.argv;
      if (!rawUid) {
        validationError(ctx, 'uid is required', 'Usage: kb inbox thread <uid>', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        validationError(ctx, `Invalid uid: "${rawUid}" — must be a number`, undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const account = resolveAccount(input.flags.account);
        const thread = await getThread(account, uid, {
          folder: input.flags.folder ?? 'INBOX',
        });

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: thread });
          return { ok: true, result: thread };
        }

        ctx.ui?.info?.(`Thread: ${thread.length} message${thread.length !== 1 ? 's' : ''}`);

        ctx.ui?.chain?.(thread.map((msg, i) => ({
          title: `[${i + 1}/${thread.length}] [uid:${msg.uid}] ${msg.subject}`,
          sections: [{
            items: [
              `from: ${formatFrom(msg.from)}  ${formatDate(msg.date)}`,
              msg.text ? msg.text.slice(0, 500) : '(no text body)',
            ],
          }],
        })));

        return { ok: true, result: thread };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
