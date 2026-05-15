import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, createTask } from '@kb-labs/clickup-core';
import type { CreateTaskInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, CreateTaskInput, { listId: string }>,
  ) {
    try {
      const apiKey = requireApiKey();
      const listId = input.params?.listId;
      if (!listId) throw new Error('listId is required');
      if (!input.body) throw new Error('body is required');

      return createTask(apiKey, listId, input.body);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
