import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import { analyzeLayering, QualitySnapshotStore } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';
import type { GateFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<GateFlags>, { exitCode: number }>({
  id: 'quality:gate',
  description: 'Architecture gate: fail if new layering violations introduced',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<GateFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();
      const cfg = config ?? defaultQualityConfig;

      const report = await analyzeLayering({ rootDir: cwd, layerMap: cfg.layers });
      const current = report.totalViolations;

      // Compare against last snapshot if available
      const store = new QualitySnapshotStore(cwd, cfg.maxSnapshots);
      const { latest } = store.history();
      const baseline = latest?.counters.layeringViolations ?? null;

      const newViolations = baseline !== null ? current - baseline : null;
      const failed = flags.strict
        ? current > 0
        : newViolations !== null
          ? newViolations > 0
          : current > 0;

      const result = {
        passed: !failed,
        current,
        baseline,
        newViolations,
        violations: report.violations,
        affectedPackages: report.affectedPackages,
      };

      if (flags.json) {
        ctx.ui?.json?.(result);
        return { exitCode: failed ? 1 : 0 };
      }

      if (!failed) {
        const msg =
          baseline !== null
            ? `Gate passed — no new violations (${current} pre-existing)`
            : 'Gate passed — no layering violations';
        ctx.ui?.success?.(msg);
        return { exitCode: 0 };
      }

      const sections = [];

      if (newViolations !== null && newViolations > 0) {
        sections.push({
          header: `New violations introduced: ${newViolations} (was ${baseline}, now ${current})`,
          items: report.violations
            .map(v => `${v.fromPackage} → ${v.toPackage}  ${v.importSpecifier}`)
            .slice(0, 20),
        });
      } else {
        sections.push({
          header: `${current} layering violation(s) in ${report.affectedPackages.length} package(s)`,
          items: report.affectedPackages,
        });
      }

      ctx.ui?.error?.('Gate failed — architecture violations detected', { sections });
      return { exitCode: 1 };
    },
  },
});
