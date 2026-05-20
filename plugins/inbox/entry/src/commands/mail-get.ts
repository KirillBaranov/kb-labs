import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, getMessage } from '@kb-labs/inbox-core';
import { handleError, validationError } from '../utils/error.js';
import { formatDate, formatFrom } from '../utils/slim.js';

type GetFlags = {
  folder?: string;
  attachments?: boolean;
  account?: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.get',
  description: 'Get full email content by uid',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<GetFlags>) {
      const [rawUid] = input.argv;
      if (!rawUid) {
        validationError(ctx, 'uid is required', 'Usage: kb inbox get <uid>', input.flags.json);
        return { exitCode: 1, result: null };
      }

      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        validationError(ctx, `Invalid uid: "${rawUid}" — must be a number`, undefined, input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const account = resolveAccount(input.flags.account);
        const email = await getMessage(account, uid, {
          folder: input.flags.folder ?? 'INBOX',
          withAttachments: input.flags.attachments,
        });

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: email });
          return { exitCode: 0, result: email };
        }

        const sections: Array<{ header?: string; items: string[] }> = [];

        if (email.cc?.length) {
          sections.push({ header: 'CC', items: [email.cc.map(a => formatFrom(a)).join(', ')] });
        }
        if (email.text) {
          sections.push({ header: 'Body', items: [email.text.slice(0, 2000)] });
        }
        if (email.attachments?.length) {
          sections.push({ header: 'Attachments', items: email.attachments.map(a => `${a.filename} (${a.contentType})`) });
        }

        ctx.ui?.sideBox?.({
          title: `[${email.uid}] ${email.subject}`,
          status: 'info',
          summary: {
            'From':   formatFrom(email.from),
            'To':     email.to.map(a => formatFrom(a)).join(', '),
            'Date':   formatDate(email.date),
            'Folder': email.folder,
            'Flags':  email.flags.join(' ') || '—',
          },
          sections,
        });

        return { exitCode: 0, result: email };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
