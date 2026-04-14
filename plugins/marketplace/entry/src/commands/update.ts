import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { get, post } from '../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../scope.js';

interface UpdateFlags {
  json?: boolean;
  scope?: string;
}

interface UpdateInput {
  argv?: string[];
  flags?: UpdateFlags;
}

interface PackageEntry {
  id: string;
  version: string;
  primaryKind: string;
}

interface UpdateResultData {
  installed: PackageEntry[];
  warnings: string[];
  scope: string;
}

export default defineCommand<unknown, UpdateInput, UpdateResultData>({
  id: 'marketplace:update',
  description: 'Update marketplace package(s)',

  handler: {
    async execute(ctx: PluginContextV3, input: UpdateInput): Promise<CommandResult<UpdateResultData>> {
      const argv = input.argv ?? [];
      const flags = (input.flags ?? input) as UpdateFlags;

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { installed: [], warnings: [], scope: '' } };
        }
        throw err;
      }

      // Both the listing and the per-package update must target the same scope.
      const body = scopeBody(scopeCtx);

      let packageIds = argv;
      if (packageIds.length === 0) {
        const listQuery: Record<string, string> = { scope: scopeCtx.scope };
        if (scopeCtx.projectRoot) { listQuery.projectRoot = scopeCtx.projectRoot; }
        const all = await get<{ entries: PackageEntry[] }>('/packages', listQuery);
        packageIds = all.entries.map(e => e.id);
      }

      if (packageIds.length === 0) {
        ctx.ui?.info?.(`Nothing to update (${scopeCtx.scope})`);
        return { exitCode: 0, result: { installed: [], warnings: [], scope: scopeCtx.scope } };
      }

      const installed: PackageEntry[] = [];
      const warnings: string[] = [];

      for (const id of packageIds) {
        try {
          const result = await post<PackageEntry>(`/packages/${encodeURIComponent(id)}/update`, body);
          installed.push(result);
        } catch (err) {
          warnings.push(`${id}: ${(err as Error).message}`);
        }
      }

      if (installed.length === 0) {
        ctx.ui?.info?.(`Nothing to update (${scopeCtx.scope})`);
      } else {
        ctx.ui?.success?.(`Update completed (${scopeCtx.scope})`, {
          sections: [
            {
              header: 'Updated',
              items: installed.map(p => `${p.id}@${p.version} (${p.primaryKind})`),
            },
            ...(warnings.length > 0 ? [{ header: 'Warnings', items: warnings }] : []),
          ],
        });
      }

      return { exitCode: 0, result: { installed, warnings, scope: scopeCtx.scope } };
    },
  },
});
