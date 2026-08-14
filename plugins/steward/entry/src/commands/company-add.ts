import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addCompany } from '@kb-labs/steward-core';

type Flags = { name?: string; json?: boolean };

export default defineCommand({
  id: 'steward:company.add',
  description: 'Add a company (thin — just a name to link people to)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { name, json } = input.flags;
      if (!name?.trim()) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const company = await addCompany({ name });
        if (json) {ctx.ui?.json?.({ ok: true, result: company });}
        else {ctx.ui?.info?.(`Added company "${company.name}" (${company.id})`);}
        return { ok: true, result: company };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:company.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
