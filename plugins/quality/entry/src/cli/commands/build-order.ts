/**
 * quality:build-order - Calculate build order and dependency layers
 *
 * Uses topological sort to determine correct build order.
 * Shows build layers where each layer can build in parallel.
 */

import { defineCommand, useConfig, type CLIInput, type PluginContextV3 , type CommandResult} from '@kb-labs/sdk';
import { analyzeBuildOrder } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';
import type { BuildOrderFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<BuildOrderFlags>, unknown>({
  id: 'quality:build-order',
  description: 'Calculate build order using topological sort',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BuildOrderFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cfg = config ?? defaultQualityConfig;
      const cwd = ctx.cwd ?? process.cwd();

      const result = analyzeBuildOrder({
        rootDir: cwd,
        layerMap: cfg.layers,
        filterPackage: flags.package,
      });

      if (result.hasCircular) {
        if (flags.json) {
          ctx.ui?.json?.({ ...result, ok: false });
        } else {
          ctx.ui?.error?.(`Circular dependencies detected — build order cannot be fully determined`, {
            sections: result.circular.map((cycle, i) => ({
              header: `Cycle ${i + 1}`,
              items: cycle,
            })),
          });
        }
        return { ok: false, error: 'Command failed' };
      }

      if (flags.json) {
        ctx.ui?.json?.(result);
        return { ok: true };
      }

      if (flags.script) {
        for (let i = 0; i < result.layers.length; i++) {
          const layer = result.layers[i];
          if (!layer) continue;
          ctx.ui?.success?.(`# Layer ${i + 1}`, { sections: [{ header: '', items: layer.map(p => `pnpm --filter "${p}" run build`) }] });
        }
        return { ok: true };
      }

      const sections = flags.layers
        ? result.layers.map((layer, i) => ({
            header: `Layer ${i + 1} — ${layer.length} package(s) (parallel)`,
            items: layer,
          }))
        : [{ header: 'Build order', items: result.sorted.map((p, i) => `${i + 1}. ${p}`) }];

      sections.push({
        header: 'Summary',
        items: [`${result.packageCount} packages in ${result.layerCount} layers`],
      });

      ctx.ui?.success?.(flags.package ? `Build order for ${flags.package}` : 'Monorepo build order', { sections });
      return { ok: true };
    },
  },
});
