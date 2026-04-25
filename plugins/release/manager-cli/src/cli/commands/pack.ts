/**
 * Release pack command — verify built artifacts via npm pack.
 * Atomic step: reads plan, runs npm pack checks, emits output marker for workflow.
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
import {
  planRelease,
  verifyPackages,
  type ReleaseConfig,
  type VerifyResult,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface PackFlags {
  scope?: string;
  json?: boolean;
}

type ReleasePackResult = CommandResult & {
  ok?: boolean;
  issues?: string[];
  results?: VerifyResult[];
};

function buildPackSections(
  results: VerifyResult[],
  symbols: { success: string; error: string; warning: string },
): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [];

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (passed.length > 0) {
    sections.push({
      header: 'Verified',
      items: passed.map(r => `${symbols.success} ${r.name}`),
    });
  }

  if (failed.length > 0) {
    sections.push({
      header: 'Issues found',
      items: failed.flatMap(r =>
        r.issues.map(issue => `${symbols.error} ${r.name}: ${issue}`),
      ),
    });
  }

  return sections;
}

export default defineCommand({
  id: 'release:pack',
  description: 'Verify built package artifacts via npm pack (checks exports, test leaks, syntax)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PackFlags>): Promise<ReleasePackResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = fileConfig ?? {};

      const planLoader = useLoader('Discovering packages...');
      planLoader.start();
      const plan = await planRelease({ cwd: repoRoot, config, scope: flags.scope });
      planLoader.succeed(`Found ${plan.packages.length} package(s)`);

      if (plan.packages.length === 0) {
        const msg = `No packages found${flags.scope ? ` matching scope: ${flags.scope}` : ''}`;
        if (flags.json) { ctx.ui?.json?.({ ok: true, issues: [], results: [], message: msg }); }
        else { ctx.ui?.write?.(msg); }
        console.log('::kb-output::' + JSON.stringify({ ok: true, issues: [] }));
        return { exitCode: 0, ok: true, issues: [], results: [] };
      }

      const verifyLoader = useLoader(`Verifying ${plan.packages.length} package(s)...`);
      verifyLoader.start();

      const results = await verifyPackages(plan.packages, {
        logger: ctx.platform?.logger,
        onProgress: (name, result) => {
          ctx.platform?.logger?.info?.(`Verified ${name}`, { ok: result.success, issues: result.issues.length });
        },
      });

      const ok = results.every(r => r.success);
      const issues = results.flatMap(r => r.issues.map(issue => `${r.name}: ${issue}`));

      if (ok) {
        verifyLoader.succeed(`All ${results.length} package(s) verified`);
      } else {
        verifyLoader.fail(`${results.filter(r => !r.success).length} package(s) have issues`);
      }

      console.log('::kb-output::' + JSON.stringify({ ok, issues }));

      if (flags.json) {
        ctx.ui?.json?.({ ok, issues, results });
        return { exitCode: ok ? 0 : 1, ok, issues, results };
      }

      ctx.ui.sideBox({
        title: 'Pack Verification',
        sections: buildPackSections(results, ctx.ui.symbols),
        status: ok ? 'success' : 'error',
      });

      return { exitCode: ok ? 0 : 1, ok, issues, results };
    },
  },
});
