import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listAccounts } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';

type AccountsFlags = {
  json?: boolean;
};

export default defineCommand({
  id: 'inbox:accounts',
  description: 'List configured email accounts',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<AccountsFlags>) {
      try {
        const accounts = listAccounts();

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: accounts });
          return { ok: true, result: accounts };
        }

        if (!accounts.length) {
          ctx.ui?.info?.('No accounts configured. Set INBOX_ACCOUNTS=work,personal and account vars.');
          return { ok: true, result: accounts };
        }

        ctx.ui?.chain?.(accounts.map((acc, i) => ({
          title: `[${i}] ${acc.name}`,
          sections: [{
            items: [
              `user: ${acc.user}`,
              `imap: ${acc.imapHost}:${acc.imapPort}`,
            ],
          }],
        })));

        return { ok: true, result: accounts };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
