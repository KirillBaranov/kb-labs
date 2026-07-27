import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import {
  analyzeLayering,
  analyzeCoupling,
  runKnip,
  analyzeTypes,
  calculateHealth,
} from '@kb-labs/quality-core';
import { CACHE_KEYS, CACHE_TTLS, defaultQualityConfig, type QualityPluginConfig, type HealthScore, type KnipReport } from '@kb-labs/quality-contracts';
import type { HealthFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<HealthFlags>, unknown>({
  id: 'quality:health',
  description: 'Multidimensional health score: architecture, TypeScript, dead code, dependencies',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<HealthFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();
      const cfg = config ?? defaultQualityConfig;

      const cached = await ctx.platform.cache.get(CACHE_KEYS.HEALTH);
      if (cached && !flags.refresh) {
        const health = cached as HealthScore;
        outputHealth(health, flags, ctx);
        return health.score < cfg.thresholds.health
          ? { ok: false, error: 'Health score is below threshold', result: health }
          : { ok: true, result: health };
      }

      const [layering, types] = await Promise.all([
        analyzeLayering({ rootDir: cwd, layerMap: cfg.layers }),
        analyzeTypes(cwd),
      ]);

      const coupling = analyzeCoupling({ rootDir: cwd, layerMap: cfg.layers });

      let knip: KnipReport = { unusedFiles: [], unusedExports: [], unusedDependencies: [], unlistedDependencies: [], totalIssues: 0 };
      if (cfg.knip.enabled) {
        knip = await runKnip({ shell: ctx.api.shell, rootDir: cwd });
      }

      const health = calculateHealth({
        layering,
        coupling,
        types,
        knip,
        totalPackages: coupling.packages.length,
        avgTestCoverage: null,
        thresholds: cfg.thresholds,
      });

      await ctx.platform.cache.set(CACHE_KEYS.HEALTH, health, CACHE_TTLS.FAST);

      outputHealth(health, flags, ctx);
        return health.score < cfg.thresholds.health
          ? { ok: false, error: 'Health score is below threshold', result: health }
          : { ok: true, result: health };
    },
  },
});

function outputHealth(health: Awaited<ReturnType<typeof calculateHealth>>, flags: { json?: boolean; detailed?: boolean }, ctx: PluginContextV3) {
  if (flags.json) {
    ctx.ui?.json?.(health);
    return;
  }

  const dimItems = Object.entries(health.dimensions).map(([key, dim]) => {
    const details = dim.details.length > 0 ? `: ${dim.details.join(', ')}` : '';
    return `${key}  ${dim.score}/100 (${dim.grade})${details}`;
  });

  ctx.ui?.success?.(`Health score: ${health.score}/100 (${health.grade})`, {
    sections: [{ header: 'Dimensions', items: dimItems }],
  });
}
