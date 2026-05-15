import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, updateList } from '@kb-labs/clickup-core';
import type { UpdateListInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, UpdateListInput, { listId: string }>,
  ) {
    try {
      const listId = input.params?.listId;
      if (!listId) throw new Error('listId is required');
      if (!input.body) throw new Error('body is required');
      return updateList(requireApiKey(), listId, input.body);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
