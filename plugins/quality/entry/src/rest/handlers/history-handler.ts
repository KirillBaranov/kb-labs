import { defineHandler, rethrowForRest, useConfig, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { QualitySnapshotStore } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, _input: RestInput<unknown, unknown>) {
    try {
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();
      const store = new QualitySnapshotStore(cwd, config?.maxSnapshots ?? defaultQualityConfig.maxSnapshots);
      return store.history();
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
