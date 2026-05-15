import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, requireTeamId, createSpace } from '@kb-labs/clickup-core';
import type { CreateSpaceInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, CreateSpaceInput>,
  ) {
    try {
      if (!input.body) throw new Error('body is required');
      return createSpace(requireApiKey(), requireTeamId(), input.body);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
