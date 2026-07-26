import { defineCommand, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, moveMessage } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';

type MoveFlags = {
  folder?: string;
  from?: string;
  account?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.move',
  description: 'Move an email to a folder',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<MoveFlags>) {
      const [rawUid] = input.argv;
      if (!rawUid) {
        validationError(ctx, 'uid is required', 'Usage: kb inbox move <uid> --folder Work', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!input.flags.folder) {
        validationError(ctx, '--folder is required', undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        validationError(ctx, `Invalid uid: "${rawUid}" — must be a number`, undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const account = resolveAccount(input.flags.account);
        await moveMessage(account, uid, input.flags.from ?? 'INBOX', input.flags.folder);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: { uid, folder: input.flags.folder } });
          return { ok: true, result: { uid, folder: input.flags.folder } };
        }

        ctx.ui?.success?.(`Moved uid=${uid} → ${input.flags.folder}`);
        return { ok: true, result: null };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
