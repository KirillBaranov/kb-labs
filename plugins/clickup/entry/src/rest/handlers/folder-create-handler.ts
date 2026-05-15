import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, createFolder } from '@kb-labs/clickup-core';
import type { CreateFolderInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, CreateFolderInput, { spaceId: string }>,
  ) {
    try {
      const spaceId = input.params?.spaceId;
      if (!spaceId) throw new Error('spaceId is required');
      if (!input.body) throw new Error('body is required');
      return createFolder(requireApiKey(), spaceId, input.body);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
