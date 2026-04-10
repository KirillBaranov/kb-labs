/**
 * GET /tests handler
 *
 * Test execution and coverage tracking across monorepo
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { runTests } from '@kb-labs/quality-core/tests';
import type { TestRunResult } from '@kb-labs/quality-contracts';

export type TestsRequest = {
  package?: string;
  timeout?: number;
  withCoverage?: boolean;
  coverageOnly?: boolean;
};

export type TestsResponse = TestRunResult;

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<TestsRequest, unknown>
  ): Promise<TestsResponse> {
    const { package: packageFilter, timeout, withCoverage, coverageOnly } = input.query ?? {};

    return runTests(ctx.cwd, {
      packageFilter,
      timeout: timeout || 60000,
      withCoverage: withCoverage ?? false,
      coverageOnly: coverageOnly ?? false,
    });
  },
});
