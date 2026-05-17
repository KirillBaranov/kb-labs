import { defineHandler, useConfig, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { SnapshotStore, analyzeTrends } from '@kb-labs/qa-core';
import { TRENDS_WINDOW, type QAPluginConfig } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput<{ window?: string }>) {
    try {
      const config = await useConfig<QAPluginConfig>();
      const store = new SnapshotStore(ctx.cwd, config?.historyMaxEntries);

      const window = Number(input.query?.window) || TRENDS_WINDOW;
      const history = store.loadRunHistory();
      const analysis = analyzeTrends(history, window);

      return analysis;
    } catch (error) {
      rethrowForRest(error);
    }
  },
});
