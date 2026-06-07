/**
 * workflow:lint command — validate workflow files against WorkflowSpecSchema.
 *
 * Runs locally (no daemon): discovers files under `.kb/workflows` (or a path),
 * validates each, and reports per-file issues with their JSON-path. Thin CLI
 * wrapper — all logic lives in the core (`@kb-labs/workflow-runtime`).
 */

import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { lintWorkflowFiles } from '@kb-labs/workflow-runtime';

interface LintFlags {
  path?: string;
  json?: boolean;
  strict?: boolean;
}

export default defineCommand<unknown, CLIInput<LintFlags>, { exitCode: number }>({
  id: 'workflow:lint',
  description: 'Validate workflow files against the schema',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<LintFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const strict = flags?.strict ?? false;
      const path = flags?.path ?? argv[0];

      try {
        const results = await lintWorkflowFiles({ path });

        const isFailed = (r: (typeof results)[number]): boolean =>
          !r.ok || (strict && r.warnings.length > 0);
        const failed = results.filter(isFailed);

        if (outputJson) {
          ctx.ui?.json?.({ ok: failed.length === 0, files: results });
          return { exitCode: failed.length === 0 ? 0 : 1 };
        }

        if (results.length === 0) {
          ctx.ui?.warn?.('No workflow files found');
          return { exitCode: 0 };
        }

        for (const r of results) {
          if (!isFailed(r)) {
            ctx.ui?.info?.(`✓ ${r.relativePath}`);
            continue;
          }
          ctx.ui?.error?.(`✗ ${r.relativePath}`);
          for (const err of r.errors) {
            ctx.ui?.error?.(`    ${err}`);
          }
          if (strict) {
            for (const warn of r.warnings) {
              ctx.ui?.error?.(`    (warning) ${warn}`);
            }
          }
        }

        if (failed.length === 0) {
          ctx.ui?.success?.(`${results.length} workflow file(s) valid`);
          return { exitCode: 0 };
        }

        ctx.ui?.warn?.(`${failed.length}/${results.length} file(s) failed validation`);
        return { exitCode: 1 };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { exitCode: 1 };
      }
    },
  },
});
