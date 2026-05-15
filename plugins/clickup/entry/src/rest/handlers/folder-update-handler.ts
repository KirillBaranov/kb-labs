import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, updateFolder } from '@kb-labs/clickup-core';
import type { UpdateFolderInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, UpdateFolderInput, { folderId: string }>,
  ) {
    try {
      const folderId = input.params?.folderId;
      if (!folderId) throw new Error('folderId is required');
      if (!input.body) throw new Error('body is required');
      return updateFolder(requireApiKey(), folderId, input.body);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
