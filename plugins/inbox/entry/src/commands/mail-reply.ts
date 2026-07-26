import { defineCommand, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, getMessage, replyMessage } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';

type ReplyFlags = {
  body?: string;
  folder?: string;
  account?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.reply',
  description: 'Reply to an email by uid (preserves thread)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ReplyFlags>) {
      const [rawUid] = input.argv;
      if (!rawUid) {
        validationError(ctx, 'uid is required', 'Usage: kb inbox reply <uid> --body "..."', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!input.flags.body) {
        validationError(ctx, '--body is required', undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        validationError(ctx, `Invalid uid: "${rawUid}" — must be a number`, undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const account = resolveAccount(input.flags.account);
        const folder = input.flags.folder ?? 'INBOX';

        const original = await getMessage(account, uid, { folder });
        const result = await replyMessage(account, {
          body: input.flags.body,
          originalMessageId: original.messageId,
          originalReferences: original.references,
          originalSubject: original.subject,
        }, input.flags.body);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result });
          return { ok: true, result };
        }

        ctx.ui?.success?.(`Reply sent  id: ${result.messageId}`);
          return { ok: true, result };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
