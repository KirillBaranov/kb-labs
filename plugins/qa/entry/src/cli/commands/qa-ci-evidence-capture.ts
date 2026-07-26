import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineCommand, useConfig, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { GithubActionsProvider } from '@kb-labs/qa-core';
import type { QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaCiEvidenceCaptureFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaCiEvidenceCaptureFlags>, { exitCode: number }>({
  id: 'qa:ci-evidence-capture',
  description: 'Capture a compact GitHub Actions run dossier for later QA analysis',
  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaCiEvidenceCaptureFlags>): Promise<{ exitCode: number }> {
      const config = await useConfig<QAPluginConfig>();
      const repository = input.flags.repository ?? config?.ci?.repository ?? process.env.GITHUB_REPOSITORY;
      const runId = input.flags.runId ?? process.env.GITHUB_RUN_ID;
      if (!repository || !runId) {
        ctx.ui?.error?.('GitHub repository and run ID are required. Pass --repository/--run-id or run inside GitHub Actions.');
        return { exitCode: 2 };
      }
      try {
        const cwd = ctx.cwd ?? process.cwd();
        const provider = new GithubActionsProvider(ctx.api.shell, cwd);
        const dossier = await provider.captureRun({
          repository,
          runId,
          workflowPath: process.env.GITHUB_WORKFLOW_REF?.split('@')[0],
          workflowSha: process.env.GITHUB_SHA,
        });
        const output = resolve(cwd, input.flags.output);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, `${JSON.stringify(dossier, null, 2)}\n`);
        if (input.flags.json) {
          ctx.ui?.json?.(dossier);
        } else {
          ctx.ui?.success?.(`Captured CI evidence for run ${dossier.run.id}`, {
            sections: [
              { header: 'Evidence', items: [
                `workflow: ${dossier.workflow.name}`,
                `jobs: ${dossier.jobs.length}`,
                `collection: ${dossier.collectionStatus}`,
                `saved: ${output}`,
              ] },
            ],
          });
        }
        return { exitCode: 0 };
      } catch (error) {
        ctx.ui?.error?.(`Unable to capture CI evidence: ${error instanceof Error ? error.message : String(error)}`);
        return { exitCode: 1 };
      }
    },
  },
});
