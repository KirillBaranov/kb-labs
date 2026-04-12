import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import type { ActionsResponse } from '@kb-labs/commit-contracts';

/**
 * GET /actions handler
 *
 * Returns minimal data for actions widget (widget mainly displays action buttons).
 * Returns currently selected scope for context.
 */
export default defineHandler({
  async execute(_ctx: PluginContextV3, input: RestInput<{ scope?: string }>): Promise<ActionsResponse> {
    const scope = input.query?.scope;

    return {
      scope,
    };
  },
});
