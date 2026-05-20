import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { listAccounts } from '@kb-labs/inbox-core';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(_ctx: PluginContextV3, _input: RestInput<never, never, never>) {
    try {
      const accounts = listAccounts();
      return { ok: true, result: accounts };
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
