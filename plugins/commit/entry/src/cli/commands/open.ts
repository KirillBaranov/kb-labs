/**
 * commit:open command
 * Show current commit plan
 */

import { defineCommand, findRepoRoot, type PluginContextV3 } from '@kb-labs/sdk';
import { loadPlan, getCurrentPlanPath, formatCommitMessage } from '@kb-labs/commit-core';
import type { OpenOutput } from '@kb-labs/commit-contracts';

type OpenInput = {
  json?: boolean;
  scope?: string;
};

type OpenResult = {
  exitCode: number;
  result?: OpenOutput;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'commit:open',
  description: 'Show current commit plan',

  handler: {
    async execute(ctx: PluginContextV3, input: OpenInput): Promise<OpenResult> {
      const startTime = Date.now();
      const cwd = (await findRepoRoot(ctx.cwd || process.cwd())) ?? process.cwd();

      const scope = input.scope ?? 'root';

      // Load current plan
      const plan = await loadPlan(cwd, scope);
      const planPath = getCurrentPlanPath(cwd, scope);

      // Output
      const output: OpenOutput = {
        hasPlan: plan !== null,
        plan: plan ?? undefined,
        planPath: plan ? planPath : undefined,
      };

      if (input.json) {
        ctx.ui?.json?.(output);
      } else {
        if (!plan) {
          ctx.ui?.info?.('No commit plan found. Run `kb commit:generate` to create one.');
        } else {
          // Build commits section
          const commitsItems = plan.commits.map((commit, i) => {
            const message = formatCommitMessage(commit);
            const breaking = commit.breaking ? ' ⚠️  BREAKING' : '';
            return `${i + 1}. ${message} [${commit.files.length} file(s)]${breaking}`;
          });

          // Build git status section
          const status = plan.gitStatus;
          const statusItems = [
            `Staged: ${status.staged.length} file(s)`,
            `Unstaged: ${status.unstaged.length} file(s)`,
            `Untracked: ${status.untracked.length} file(s)`,
          ];

          const sections: Array<{ header?: string; items: string[] }> = [];

          sections.push({
            header: 'Commits',
            items: commitsItems,
          });

          sections.push({
            header: 'Git Status (at generation)',
            items: statusItems,
          });

          const summaryItems: string[] = [
            `Plan path: ${planPath}`,
            `Created: ${plan.createdAt}`,
            `Total files: ${plan.metadata.totalFiles}`,
            `Total commits: ${plan.metadata.totalCommits}`,
          ];

          if (plan.metadata.llmUsed) {
            const generator = plan.metadata.escalated ? 'LLM (Phase 2)' : 'LLM (Phase 1)';
            summaryItems.push(`Generator: ${generator}`);
          } else {
            summaryItems.push('Generator: Heuristics');
          }

          sections.unshift({
            header: 'Summary',
            items: summaryItems,
          });

          ctx.ui?.success?.('Current Commit Plan', {
            sections,
          });
        }
      }

      return {
        exitCode: 0,
        result: output,
        meta: {
          timing: Date.now() - startTime,
        },
      };
    },
  },
});
