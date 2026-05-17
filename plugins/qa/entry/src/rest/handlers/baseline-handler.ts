import { defineHandler, useConfig, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { SnapshotStore } from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput) {
    try {
      const config = await useConfig<QAPluginConfig>();
      const store = new SnapshotStore(ctx.cwd, config?.historyMaxEntries);
      return { baseline: store.loadBaseline() };
    } catch (error) {
      rethrowForRest(error);
    }
  },
});
