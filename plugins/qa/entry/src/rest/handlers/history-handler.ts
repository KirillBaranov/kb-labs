import { defineHandler, useConfig, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { SnapshotStore } from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput<{ limit?: string }>) {
    try {
      const config = await useConfig<QAPluginConfig>();
      const store = new SnapshotStore(ctx.cwd, config?.historyMaxEntries);

      const limit = Number(input.query?.limit) || 20;
      const history = [...store.loadRunHistory()].reverse().slice(0, limit);

      return { history, total: history.length };
    } catch (error) {
      rethrowForRest(error);
    }
  },
});
