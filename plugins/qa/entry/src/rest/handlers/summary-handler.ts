import { defineHandler, useConfig, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { SnapshotStore } from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput) {
    try {
      const config = await useConfig<QAPluginConfig>();
      const store = new SnapshotStore(ctx.cwd, config?.historyMaxEntries);

      return {
        latestRun: store.latestRun(),
        latestCheck: store.latestCheck(),
        latestStats: store.latestStats(),
        baseline: store.loadBaseline(),
        defaultTasks: config?.defaultTasks ?? null,
      };
    } catch (error) {
      rethrowForRest(error);
    }
  },
});
