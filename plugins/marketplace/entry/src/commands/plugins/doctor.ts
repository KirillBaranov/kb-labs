import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { get } from '../../http.js';

interface DoctorFlags { json?: boolean }
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
      const report = await get<DoctorResultData>('/diagnostics');

      if (flags.json) {
        ctx.ui?.json?.(report);
      } else if (report.issues.length === 0) {
        ctx.ui?.success?.(`All ${report.total} packages healthy`);
      } else {
        const errors = report.issues.filter(i => i.severity === 'error');
        ctx.ui?.warn?.('Marketplace Doctor', {
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
