import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { resolveAccount, sendMessage } from '@kb-labs/inbox-core';
import { handleError, validationError } from '../utils/error.js';

type SendFlags = {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
  account?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'inbox:mail.send',
  description: 'Send an email',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SendFlags>) {
      if (!input.flags.to) {
        validationError(ctx, '--to is required', 'Usage: kb inbox send --to user@example.com --subject "..." --body "..."', input.flags.json);
        return { exitCode: 1, result: null };
      }
      if (!input.flags.subject) {
        validationError(ctx, '--subject is required', undefined, input.flags.json);
        return { exitCode: 1, result: null };
      }
      if (!input.flags.body) {
        validationError(ctx, '--body is required', undefined, input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const account = resolveAccount(input.flags.account);
        const result = await sendMessage(account, {
          to: input.flags.to,
          subject: input.flags.subject,
          body: input.flags.body,
          cc: input.flags.cc,
          bcc: input.flags.bcc,
        });

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, result });
          return { exitCode: 0, result };
        }

        ctx.ui?.success?.(`Message sent  id: ${result.messageId}`);
        return { exitCode: 0, result };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
