import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { get, post } from '../http.js';

interface UpdateInput {
  argv?: string[];
  flags?: { json?: boolean };
}

interface PackageEntry {
  id: string;
  version: string;
  primaryKind: string;
}

interface UpdateResultData {
  installed: PackageEntry[];
  warnings: string[];
}

export default defineCommand<unknown, UpdateInput, UpdateResultData>({
  id: 'marketplace:update',
  description: 'Update marketplace package(s)',

  handler: {
    async execute(ctx: PluginContextV3, input: UpdateInput): Promise<CommandResult<UpdateResultData>> {
      const argv = input.argv ?? [];

      // If no args given, fetch all installed packages and update each
      let packageIds = argv;
      if (packageIds.length === 0) {
        const all = await get<{ entries: PackageEntry[] }>('/packages');
        packageIds = all.entries.map(e => e.id);
      }

      if (packageIds.length === 0) {
        ctx.ui?.info?.('Nothing to update');
        return { exitCode: 0, result: { installed: [], warnings: [] } };
      }

      const installed: PackageEntry[] = [];
      const warnings: string[] = [];

      for (const id of packageIds) {
        try {
          const result = await post<PackageEntry>(`/packages/${encodeURIComponent(id)}/update`, {});
          installed.push(result);
        } catch (err) {
          warnings.push(`${id}: ${(err as Error).message}`);
        }
      }

      if (installed.length === 0) {
        ctx.ui?.info?.('Nothing to update');
      } else {
        ctx.ui?.success?.('Update completed', {
          sections: [
            {
              header: 'Updated',
              items: installed.map(p => `${p.id}@${p.version} (${p.primaryKind})`),
            },
            ...(warnings.length > 0 ? [{ header: 'Warnings', items: warnings }] : []),
          ],
        });
      }

      return { exitCode: 0, result: { installed, warnings } };
    },
  },
});
