import { defineHandler, rethrowForRest, useConfig, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { analyzeBuildOrder } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput<{ package?: string }, unknown>) {
    try {
      const config = await useConfig<QualityPluginConfig>();
      const cfg = config ?? defaultQualityConfig;
      const cwd = ctx.cwd ?? process.cwd();

      return analyzeBuildOrder({
        rootDir: cwd,
        layerMap: cfg.layers,
        filterPackage: input.query?.package,
      });
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
