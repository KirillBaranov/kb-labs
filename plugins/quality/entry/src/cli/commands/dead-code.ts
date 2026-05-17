import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import { runKnip } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';
import type { DeadCodeFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<DeadCodeFlags>, { exitCode: number }>({
  id: 'quality:dead-code',
  description: 'Detect unused files, exports, and deps via knip',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DeadCodeFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();
      const cfg = config ?? defaultQualityConfig;

      if (!cfg.knip.enabled) {
        ctx.ui?.success?.('knip is disabled in config (knip.enabled = false)');
        return { exitCode: 0 };
      }

      const report = await runKnip({ shell: ctx.api.shell, rootDir: cwd });

      if (flags.json) {
        ctx.ui?.json?.(report);
        return { exitCode: report.totalIssues > 0 ? 1 : 0 };
      }

      if (report.totalIssues === 0) {
        ctx.ui?.success?.('No dead code detected');
        return { exitCode: 0 };
      }

      const sections: Array<{ header: string; items: string[] }> = [];

      if (report.unusedFiles.length > 0) {
        sections.push({
          header: `Unused files (${report.unusedFiles.length})`,
          items: report.unusedFiles,
        });
      }

      if (report.unusedExports.length > 0) {
        sections.push({
          header: `Unused exports (${report.unusedExports.length})`,
          items: report.unusedExports.map(e => `${e.file}  ${e.symbol}`),
        });
      }

      if (report.unusedDependencies.length > 0) {
        sections.push({
          header: `Unused dependencies (${report.unusedDependencies.length})`,
          items: report.unusedDependencies.map(d => `${d.package}  in ${d.workspace}`),
        });
      }

      if (report.unlistedDependencies.length > 0) {
        sections.push({
          header: `Unlisted dependencies (${report.unlistedDependencies.length})`,
          items: report.unlistedDependencies.map(d => `${d.package}  in ${d.workspace}`),
        });
      }

      ctx.ui?.error?.(`${report.totalIssues} dead code issue(s) found`, { sections });
      return { exitCode: 1 };
    },
  },
});
