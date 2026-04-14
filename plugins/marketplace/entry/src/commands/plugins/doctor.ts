import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { get } from '../../http.js';
import { resolveCliScope, CliScopeError } from '../../scope.js';

interface DoctorFlags { json?: boolean; scope?: string }
interface DoctorInput { flags?: DoctorFlags }

interface DoctorIssue {
  severity: string;
  packageId: string;
  message: string;
  remediation?: string;
}

interface DoctorResultData {
  ok: boolean;
  total: number;
  issues: DoctorIssue[];
}

export default defineCommand<unknown, DoctorInput, DoctorResultData>({
  id: 'marketplace:plugins:doctor',
  description: 'Diagnose marketplace health',

  handler: {
    async execute(ctx: PluginContextV3, input: DoctorInput): Promise<CommandResult<DoctorResultData>> {
      const flags = (input.flags ?? input) as DoctorFlags;

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { ok: false, total: 0, issues: [] } };
        }
        throw err;
      }

      const query: Record<string, string> = { scope: scopeCtx.scope };
      if (scopeCtx.projectRoot) { query.projectRoot = scopeCtx.projectRoot; }
      const report = await get<DoctorResultData>('/diagnostics', query);

      if (flags.json) {
        ctx.ui?.json?.(report);
      } else if (report.issues.length === 0) {
        ctx.ui?.success?.(`All ${report.total} packages healthy (${scopeCtx.scope})`);
      } else {
        const errors = report.issues.filter(i => i.severity === 'error');
        ctx.ui?.warn?.(`Marketplace Doctor (${scopeCtx.scope})`, {
          sections: [
            { header: 'Summary', items: [`Total: ${report.total}`, `Issues: ${report.issues.length}`, `Errors: ${errors.length}`] },
            { header: 'Issues', items: report.issues.map(i => `${i.severity === 'error' ? '❌' : '⚠'} ${i.packageId}: ${i.message}`) },
          ],
        });
      }

      return { exitCode: report.ok ? 0 : 1, result: report };
    },
  },
});
