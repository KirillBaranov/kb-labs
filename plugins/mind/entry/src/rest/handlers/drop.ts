import { defineHandler, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { DropRequestSchema, type DropRequest, type DropResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineHandler({
  async execute(_ctx: PluginContextV3, input: RestInput<unknown, DropRequest>): Promise<DropResponse> {
    try {
      const req = DropRequestSchema.parse(input.body ?? {});
      const mind = await buildMind();
      return await mind.drop(req);
    } catch (err) {
      return rethrowForRest(err);
    }
  },
});
