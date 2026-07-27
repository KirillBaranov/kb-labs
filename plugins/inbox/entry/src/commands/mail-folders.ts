import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, listFolders } from '@kb-labs/inbox-core';
import { handleError } from '../utils/error.js';

type FoldersFlags = {
  account?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'inbox:folders',
  description: 'List available folders/mailboxes',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<FoldersFlags>) {
      try {
        const account = resolveAccount(input.flags.account);
        const folders = await listFolders(account);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result: folders });
          return { ok: true, result: folders };
        }

        ctx.ui?.chain?.(folders.map(f => ({
          title: f.path,
          sections: [{
            items: [
              [
                f.specialUse ? `special: ${f.specialUse}` : null,
                f.flags.length ? `flags: ${f.flags.join(' ')}` : null,
              ].filter(Boolean).join('  ') || '—',
            ],
          }],
        })));

        return { ok: true, result: folders };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
