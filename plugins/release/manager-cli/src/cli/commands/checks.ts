/**
 * Release checks command — run pre-release checks from config.
 * Atomic step: reads plan, runs checks, emits output marker for workflow.
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
import {
  planRelease,
  runReleaseChecks,
  resolveScopePath,
  type ReleaseConfig,
  type CheckResult,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface ChecksFlags {
  scope?: string;
  json?: boolean;
}

type ReleaseChecksResult = CommandResult & {
  ok?: boolean;
  failed?: string[];
  results?: CheckResult[];
};

function buildChecksSections(
  results: CheckResult[],
  symbols: { success: string; error: string; warning: string },
): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [];

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  if (passed.length > 0) {
    sections.push({
      header: 'Passed',
      items: passed.map(r => `${symbols.success} ${r.id}${r.timingMs ? ` (${r.timingMs}ms)` : ''}`),
    });
  }

  if (failed.length > 0) {
    sections.push({
      header: 'Failed',
      items: failed.flatMap(r => {
        const lines = [`${symbols.error} ${r.id}`];
        if (r.details?.stderr) { lines.push(`  ${r.details.stderr.slice(0, 120)}`); }
        if (r.hint) { lines.push(`  Hint: ${r.hint}`); }
        return lines;
      }),
    });
  }

  return sections;
}

export default defineCommand({
  id: 'release:checks',
  description: 'Run pre-release checks from release config',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ChecksFlags>): Promise<ReleaseChecksResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = fileConfig ?? {};
      const checks = config.checks ?? [];

      if (checks.length === 0) {
        const msg = 'No checks configured in release config';
        if (flags.json) {
          ctx.ui?.json?.({ ok: true, failed: [], results: [], message: msg });
        } else {
          ctx.ui?.write?.(msg);
        }
        console.log('::kb-output::' + JSON.stringify({ ok: true, failed: [] }));
        return { exitCode: 0, ok: true, failed: [], results: [] };
      }

      const planLoader = useLoader('Discovering packages...');
      planLoader.start();
      const plan = await planRelease({ cwd: repoRoot, config, scope: flags.scope });
      planLoader.succeed(`Found ${plan.packages.length} package(s)`);

      const scopePath = await resolveScopePath(repoRoot, flags.scope ?? 'root');
      const packagePaths = plan.packages.map(p => p.path);

      const checksLoader = useLoader(`Running ${checks.length} check(s)...`);
      checksLoader.start();

      const results = await runReleaseChecks(checks, {
        repoRoot,
        packagePaths,
        scopePath,
        logger: ctx.platform?.logger,
      });

      const ok = results.every(r => r.ok);
      const failed = results.filter(r => !r.ok).map(r => r.id);

      if (ok) {
        checksLoader.succeed(`All ${results.length} check(s) passed`);
      } else {
        checksLoader.fail(`${failed.length} check(s) failed`);
      }

      console.log('::kb-output::' + JSON.stringify({ ok, failed }));

      if (flags.json) {
        ctx.ui?.json?.({ ok, failed, results });
        return { exitCode: ok ? 0 : 1, ok, failed, results };
      }

      ctx.ui.sideBox({
        title: 'Pre-release Checks',
        sections: buildChecksSections(results, ctx.ui.symbols),
        status: ok ? 'success' : 'error',
      });

      return { exitCode: ok ? 0 : 1, ok, failed, results };
    },
  },
});
