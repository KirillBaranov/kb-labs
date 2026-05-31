import { defineHandler, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import type { StatusResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<{ indexId?: string }, unknown>,
  ): Promise<StatusResponse> {
    try {
      const mind = await buildMind();
      return await mind.status(input.query?.indexId);
    } catch (err) {
      return rethrowForRest(err);
    }
  },
});
