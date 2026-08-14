import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listCompanies } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:company.list',
  description: 'List companies',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { json } = input.flags;
      try {
        const companies = await listCompanies();
        if (json) {ctx.ui?.json?.({ ok: true, result: companies });}
        else if (companies.length === 0) {ctx.ui?.info?.('No companies yet.');}
        else {ctx.ui?.chain?.(companies.map((c) => ({ title: c.name, sections: [{ items: [c.id] }] })));}
        return { ok: true, result: companies };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:company.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
