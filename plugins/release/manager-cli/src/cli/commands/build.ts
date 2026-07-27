/**
 * Release build command — build packages in plan using safe build strategy.
 * Atomic step: reads plan, builds, emits output marker for workflow.
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
import {
  planRelease,
  buildPackages,
  mergeConfigWithFlow,
  type ReleaseConfig,
  type BuildResult,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface BuildFlags {
  scope?: string;
  flow?: string;
  json?: boolean;
}

type ReleaseBuildResult = CommandResult<unknown>;

function buildSections(
  results: BuildResult[],
  symbols: { success: string; error: string },
): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [];

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (passed.length > 0) {
    sections.push({
      header: 'Built',
      items: passed.map(r => `${symbols.success} ${r.name}${r.durationMs ? ` (${r.durationMs}ms)` : ''}`),
    });
  }

  if (failed.length > 0) {
    sections.push({
      header: 'Failed',
      items: failed.flatMap(r => {
        const lines = [`${symbols.error} ${r.name}`];
        if (r.error) { lines.push(`  ${r.error.slice(0, 200)}`); }
        return lines;
      }),
    });
  }

  return sections;
}

export default defineCommand({
  id: 'release:build',
  description: 'Build packages from release plan using safe build strategy',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BuildFlags>): Promise<ReleaseBuildResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = fileConfig ?? {};

      const planLoader = useLoader('Discovering packages...');
      planLoader.start();
      const plan = await planRelease({ cwd: repoRoot, config, scope: flags.scope, flow: flags.flow });
      planLoader.succeed(`Found ${plan.packages.length} package(s)`);

      if (plan.packages.length === 0) {
        const msg = `No packages found${flags.scope ? ` matching scope: ${flags.scope}` : ''}`;
        if (flags.json) { ctx.ui?.json?.({ ok: true, failed: [], results: [], message: msg }); }
        else { ctx.ui?.write?.(msg); }
        console.log('::kb-output::' + JSON.stringify({ ok: true, failed: [] }));
        return { ok: true, result: { ok: true, failed: [], results: [] } };
      }

      const effectiveConfig = flags.flow ? mergeConfigWithFlow(config, flags.flow) : config;
      const buildScript = effectiveConfig.build?.script;

      const buildLoader = useLoader(
        buildScript
          ? `Running "pnpm run ${buildScript}"...`
          : `Building ${plan.packages.length} package(s)...`,
      );
      buildLoader.start();

      const results: BuildResult[] = buildScript
        ? await (async () => {
            const startedAt = Date.now();
            const execResult = await ctx.api.shell.exec('pnpm', ['run', buildScript], {
              cwd: repoRoot,
              timeout: 20 * 60 * 1000,
            });
            return [{
              name: `pnpm run ${buildScript}`,
              success: execResult.ok,
              durationMs: Date.now() - startedAt,
              error: execResult.ok ? undefined : (execResult.stderr || execResult.stdout).trim().split('\n').slice(-30).join('\n'),
            }];
          })()
        : await buildPackages(plan.packages, {
            logger: ctx.platform?.logger,
            onProgress: (name, result) => {
              ctx.platform?.logger?.info?.(`Built ${name}`, { ok: result.success, ms: result.durationMs });
            },
          });

      const ok = results.every(r => r.success);
      const failed = results.filter(r => !r.success).map(r => r.name);

      if (ok) {
        buildLoader.succeed(`Built ${results.length} package(s)`);
      } else {
        buildLoader.fail(`${failed.length} package(s) failed to build`);
      }

      console.log('::kb-output::' + JSON.stringify({ ok, failed }));

      if (flags.json) {
        ctx.ui?.json?.({ ok, failed, results });
        return ok ? { ok: true, result: { ok, failed, results } } : { ok: false, error: 'Command failed', result: { ok, failed, results } };
      }

      ctx.ui?.sideBox?.({
        title: 'Build Results',
        sections: buildSections(results, ctx.ui.symbols),
        status: ok ? 'success' : 'error',
      });

      return ok ? { ok: true, result: { ok, failed, results } } : { ok: false, error: 'Command failed', result: { ok, failed, results } };
    },
  },
});
