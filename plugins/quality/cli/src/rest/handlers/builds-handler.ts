/**
 * GET /builds handler
 *
 * Get build status across monorepo packages.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { checkBuilds } from '@kb-labs/quality-core/builds';
import type { BuildCheckResult } from '@kb-labs/quality-contracts';

export type BuildsRequest = {
  package?: string;
  timeout?: number;
};

export type BuildsResponse = BuildCheckResult;

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<BuildsRequest, unknown>
  ): Promise<BuildsResponse> {
    const { package: packageFilter, timeout } = input.query ?? {};

    return checkBuilds(ctx.cwd, {
      packageFilter,
      timeout: timeout || 30000,
    });
  },
});
