import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand, useConfig, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { GithubActionsProvider } from '@kb-labs/qa-core';
import type { QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaCiEvidenceSyncFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaCiEvidenceSyncFlags>, { exitCode: number }>({
  id: 'qa:ci-evidence-sync',
  description: 'Download new CI evidence artifacts into the local QA cache',
  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaCiEvidenceSyncFlags>): Promise<{ exitCode: number }> {
      const config = await useConfig<QAPluginConfig>();
      const repository = input.flags.repository ?? config?.ci?.repository ?? process.env.GITHUB_REPOSITORY;
      if (!repository) {
        ctx.ui?.error?.('GitHub repository is required. Pass --repository or configure qa.ci.repository.');
        return { exitCode: 2 };
      }
      const cwd = ctx.cwd ?? process.cwd();
      const output = resolve(cwd, input.flags.output);
      mkdirSync(output, { recursive: true });
      try {
        const result = await new GithubActionsProvider(ctx.api.shell, cwd).syncDossiers({
          repository, workflow: input.flags.workflow, limit: input.flags.limit, outputDir: output,
        });
        if (input.flags.json) {
          ctx.ui?.json?.(result);
        } else {
          ctx.ui?.success?.('Synced CI evidence', {
            sections: [{ header: 'Runs', items: [
              `downloaded: ${result.downloadedRunIds.length}`,
              `cached: ${result.cachedRunIds.length}`,
              `unavailable: ${result.unavailableRunIds.length}`,
              `cache: ${output}`,
            ] }],
          });
        }
        return { exitCode: 0 };
      } catch (error) {
        ctx.ui?.error?.(`Unable to sync CI evidence: ${error instanceof Error ? error.message : String(error)}`);
        return { exitCode: 1 };
      }
    },
  },
});
