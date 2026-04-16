import { resolve } from 'node:path';
import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { scanRoot, type Finding } from '@kb-labs/scaffold-core';

interface DoctorFlags {
  path?: string;
  json?: boolean;
}

type DoctorResult = {
  exitCode: number;
  result?: {
    packagesScanned: number;
    findings: Finding[];
  };
};

export default defineCommand({
  id: 'scaffold:doctor',
  description: 'Scan user-authored plugins for common issues',

  handler: {
    async execute(
      ctx: PluginContextV3,
      input: DoctorFlags,
    ): Promise<DoctorResult> {
      const root = resolve(input.path ?? '.kb/plugins');
      const workspaceRoot = ctx.cwd ?? process.cwd();
      const scan = await scanRoot(root, { workspaceRoot });

      const { errorCount, warnCount } = scan.findings.reduce(
        (acc, f) => {
          if (f.severity === 'error') acc.errorCount++;
          else if (f.severity === 'warn') acc.warnCount++;
          return acc;
        },
        { errorCount: 0, warnCount: 0 },
      );
      const hasErrors = errorCount > 0;

      if (input.json) {
        ctx.ui?.json?.({
          root,
          packagesScanned: scan.packagesScanned,
          findings: scan.findings,
        });
      } else if (scan.findings.length === 0) {
        ctx.ui?.success?.(`Scanned ${scan.packagesScanned} package(s) — no issues found.`, {
          title: 'scaffold doctor',
          sections: [
            { items: [`Path: ${root}`] },
          ],
        });
      } else {
        const byPkg = new Map<string, Finding[]>();
        for (const f of scan.findings) {
          const list = byPkg.get(f.package) ?? [];
          list.push(f);
          byPkg.set(f.package, list);
        }

        const sections = Array.from(byPkg.entries()).map(([pkg, findings]) => ({
          header: pkg,
          items: findings.map((f) => `${f.severity.toUpperCase()}  ${f.message}`),
        }));

        if (hasErrors) {
          ctx.ui?.error?.(`Found ${errorCount} error(s), ${warnCount} warning(s) in ${scan.packagesScanned} package(s).`, {
            title: 'scaffold doctor',
            sections,
          });
        } else {
          ctx.ui?.warn?.(`Found ${warnCount} warning(s) in ${scan.packagesScanned} package(s).`, {
            title: 'scaffold doctor',
            sections,
          });
        }
      }

      return {
        exitCode: hasErrors ? 1 : 0,
        result: {
          packagesScanned: scan.packagesScanned,
          findings: scan.findings,
        },
      };
    },
  },
});
