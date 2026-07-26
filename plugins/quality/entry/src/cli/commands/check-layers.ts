import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import { analyzeLayering } from '@kb-labs/quality-core';
import { type QualityPluginConfig, type LayeringViolation } from '@kb-labs/quality-contracts';
import type { CheckLayersFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<CheckLayersFlags>, unknown>({
  id: 'quality:check-layers',
  description: 'Detect layering violations (lower layer importing higher layer)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<CheckLayersFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const report = await analyzeLayering({
        rootDir: cwd,
        layerMap: config?.layers,
      });

      const filtered = flags.package
        ? {
            ...report,
            violations: report.violations.filter((v: LayeringViolation) => v.fromPackage.includes(flags.package!)),
            totalViolations: report.violations.filter((v: LayeringViolation) => v.fromPackage.includes(flags.package!)).length,
          }
        : report;

      if (flags.json) {
        ctx.ui?.json?.(filtered);
        return filtered.totalViolations > 0
          ? { ok: false, error: 'Layer violations found', result: filtered }
          : { ok: true, result: filtered };
      }

      if (filtered.totalViolations === 0) {
        ctx.ui?.success?.('No layering violations found');
        return { ok: true };
      }

      const byPackage = new Map<string, typeof filtered.violations>();
      for (const v of filtered.violations) {
        const list = byPackage.get(v.fromPackage) ?? [];
        list.push(v);
        byPackage.set(v.fromPackage, list);
      }

      const sections = [...byPackage.entries()].map(([pkg, vs]) => ({
        header: `${pkg} (Layer ${vs[0]?.fromLayer})`,
        items: vs.map((v: LayeringViolation) => `→ ${v.toPackage} (Layer ${v.toLayer})  ${v.importSpecifier}`),
      }));

      ctx.ui?.error?.(`${filtered.totalViolations} layering violation(s) in ${filtered.affectedPackages.length} package(s)`, { sections });
      return { ok: false, error: 'Command failed' };
    },
  },
});
