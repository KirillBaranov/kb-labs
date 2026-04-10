/**
 * kb auth logout — Remove stored Gateway credentials.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { CredentialsManager } from '@kb-labs/cli-runtime/gateway';

type LogoutFlags = {
  json: { type: 'boolean'; description: string };
};

export const authLogout = defineSystemCommand<LogoutFlags, CommandResult>({
  name: 'logout',
  description: 'Remove stored Gateway credentials',
  longDescription: 'Deletes ~/.kb/credentials.json. CLI will no longer be able to reach Gateway until re-login.',
  category: 'auth',
  examples: [
    'kb auth logout',
    'kb auth logout --json',
  ],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(ctx, _argv, flags) {
    const credentialsManager = new CredentialsManager();
    const existing = await credentialsManager.load();

    if (!existing) {
      if (flags.json) {
        ctx.ui?.json({ ok: true, message: 'No credentials found — already logged out.' });
      } else {
        ctx.ui?.write?.('No credentials found — already logged out.\n');
      }
      return { ok: true };
    }

    await credentialsManager.clear();

    if (flags.json) {
      ctx.ui?.json({ ok: true, message: 'Logged out. Credentials removed.' });
    } else {
      ctx.ui?.write?.('Logged out. Credentials removed.\n');
    }

    return { ok: true };
  },
});
