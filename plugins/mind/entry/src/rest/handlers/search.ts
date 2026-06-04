import { defineHandler, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import {
  SearchRequestSchema,
  type SearchRequest,
  type SearchResponse,
} from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineHandler({
  async execute(_ctx: PluginContextV3, input: RestInput<unknown, SearchRequest>): Promise<SearchResponse> {
    try {
      const req = SearchRequestSchema.parse(input.body ?? {});
      const mind = await buildMind();
      return await mind.search(req);
    } catch (err) {
      return rethrowForRest(err);
    }
  },
});
