import { resolve } from 'node:path';
import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { scanRoot } from '@kb-labs/scaffold-core';

interface DoctorFlags {
  path?: string;
  json?: boolean;
}

type DoctorResult = {
  exitCode: number;
  result?: {
    packagesScanned: number;
    findings: ReturnType<typeof scanRoot> extends Promise<infer R>
      ? R extends { findings: infer F }
        ? F
        : never
      : never;
  };
};

const GLYPH: Record<string, string> = {
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
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

      const hasErrors = scan.findings.some((f) => f.severity === 'error');

      if (input.json) {
        ctx.ui?.json?.({
          root,
          packagesScanned: scan.packagesScanned,
          findings: scan.findings,
        });
      } else {
        ctx.ui?.info?.(
          `Scanned ${scan.packagesScanned} package(s) under ${root}`,
        );
        if (scan.findings.length === 0) {
          ctx.ui?.success?.('No issues found.');
        } else {
          const byPkg = new Map<string, typeof scan.findings>();
          for (const f of scan.findings) {
            const list = byPkg.get(f.package) ?? [];
            list.push(f);
            byPkg.set(f.package, list);
          }
          for (const [pkg, list] of byPkg) {
            ctx.ui?.info?.(`\n  ${pkg}`);
            for (const f of list) {
              ctx.ui?.info?.(
                `    ${GLYPH[f.severity] ?? '-'} ${f.severity.toUpperCase()}: ${f.message}`,
              );
            }
          }
        }
      }

      return {
        exitCode: hasErrors ? 1 : 0,
        result: {
          packagesScanned: scan.packagesScanned,
          findings: scan.findings,
        } as never,
      };
    },
  },
});
