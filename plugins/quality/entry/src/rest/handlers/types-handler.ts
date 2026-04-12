/**
 * GET /types handler
 *
 * TypeScript type safety analysis across monorepo
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { analyzeTypes } from '@kb-labs/quality-core/types';
import type { TypeAnalysisResult } from '@kb-labs/quality-contracts';

export type TypesRequest = {
  package?: string;
  errorsOnly?: boolean;
};

export type TypesResponse = TypeAnalysisResult;

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<TypesRequest, unknown>
  ): Promise<TypesResponse> {
    const { package: packageFilter, errorsOnly } = input.query ?? {};

    return analyzeTypes(ctx.cwd, {
      packageFilter,
      errorsOnly: errorsOnly ?? false,
    });
  },
});
