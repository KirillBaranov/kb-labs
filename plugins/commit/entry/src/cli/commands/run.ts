/**
 * commit command (default flow)
 * Generate → Apply → (optional) Push
 */

import {
  defineCommand,
  useLLM,
  useLoader,
  useConfig,
  findRepoRoot,
  handleError,
  type PluginContextV3,
  type CLIInput,
} from '@kb-labs/sdk';
import type { CommandResult } from '@kb-labs/sdk';
import {
  generateCommitPlan,
  savePlan,
  hasChanges,
  getGitStatus,
  applyCommitPlan,
  pushCommits,
  saveToHistory,
  clearPlan,
} from '@kb-labs/commit-core';
import {
  type CommitRunOutput,
  type CommitPluginConfig,
  resolveCommitConfig,
  type CommitFlags,
  commitEnv,
} from '@kb-labs/commit-contracts';
import { resolveScopePath } from '../../rest/handlers/scope-resolver';

type RunResult = CommandResult<CommitRunOutput>;

async function resolveContext(ctx: PluginContextV3, flags: CommitFlags) {
  const llm = useLLM();
  const cwd = (await findRepoRoot(ctx.cwd || process.cwd())) ?? process.cwd();
  const fileConfig = await useConfig<Partial<CommitPluginConfig>>();
  const env = commitEnv.parse(ctx.runtime);
  const config = resolveCommitConfig(fileConfig ?? {}, env);
  const effectiveScope = flags.scope ?? config.scope?.default ?? 'root';
  const scopeCwd = resolveScopePath(cwd, effectiveScope, config.scope?.scopes);

  const llmComplete =
    llm && config.llm.enabled
      ? async (prompt: string, options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }) => {
          const result = await llm.complete(prompt, {
            ...options,
            temperature: options?.temperature ?? config.llm.temperature,
            maxTokens: options?.maxTokens ?? config.llm.maxTokens,
          });
          return {
            content: result.content,
            tokensUsed: result.usage ? result.usage.promptTokens + result.usage.completionTokens : undefined,
          };
        }
      : undefined;

  return { cwd, config, effectiveScope, scopeCwd, llmComplete };
}

export default defineCommand({
  id: 'commit:commit',
  description: 'Generate and apply commits (default flow)',

  handler: {
    async intent(ctx: PluginContextV3, input: CLIInput<CommitFlags>) {
      const flags = input.flags;
      const { effectiveScope, scopeCwd, llmComplete, config } = await resolveContext(ctx, flags);

      const status = await getGitStatus(scopeCwd);
      if (!hasChanges(status)) {
        return {
          summary: 'No changes to commit',
          operations: [],
        };
      }

      const plan = await generateCommitPlan({
        cwd: scopeCwd,
        llmComplete,
        config,
        allowSecrets: flags['allow-secrets'] ?? false,
        autoConfirm: flags.yes ?? false,
      });

      return {
        summary: `Generate and apply ${plan.commits.length} commit(s) in scope "${effectiveScope}"`,
        operations: plan.commits.map(c => ({
          type: 'create' as const,
          resource: 'git-commit',
          details: {
            message: `${c.type}${c.scope ? `(${c.scope})` : ''}: ${c.message}`,
            files: c.files.length,
          },
        })),
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<CommitFlags>): Promise<RunResult> {
      const startTime = Date.now();
      const flags = input.flags;
      const { cwd, effectiveScope, scopeCwd, llmComplete, config } = await resolveContext(ctx, flags);
      const withPush = flags['with-push'] ?? false;
      const outputJson = flags.json ?? false;

      // 1. Check for changes
      const statusLoader = useLoader('Checking git status...');
      statusLoader.start();
      let status;
      try {
        status = await getGitStatus(scopeCwd);
      } catch (err) {
        statusLoader.fail('Failed to check git status');
        handleError(ctx, err, outputJson);
        return { ok: false, error: 'Command failed' };
      }

      if (!hasChanges(status)) {
        statusLoader.stop();
        ctx.ui?.warn?.('No changes to commit');
        return { ok: false, error: 'Command failed' };
      }
      statusLoader.succeed('Git status analyzed');

      // 2. Generate plan
      const analyzeLoader = useLoader('Analyzing changes...');
      analyzeLoader.start();

      const plan = await generateCommitPlan({
        cwd: scopeCwd,
        llmComplete,
        config,
        allowSecrets: flags['allow-secrets'] ?? false,
        autoConfirm: flags.yes ?? false,
        onProgress: (message) => analyzeLoader.update({ text: message }),
        onPauseProgress: () => analyzeLoader.stop(),
        onResumeProgress: () => analyzeLoader.start(),
      });

      await savePlan(cwd, plan);
      analyzeLoader.succeed(`Generated commit plan with ${plan.commits.length} commit(s)`);

      // 3. Apply plan
      const applyLoader = useLoader('Applying commits...');
      applyLoader.start();
      const applyResult = await applyCommitPlan(scopeCwd, plan);

      if (!applyResult.success) {
        applyLoader.fail('Failed to apply commits');
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: { code: 'APPLY_FAILED', message: applyResult.errors.join('; ') } });
        } else {
          ctx.ui?.error?.('Failed to apply commits', {
            hint: 'Check git status and resolve conflicts manually',
            cause: applyResult.errors.join('; '),
          });
        }
        return { ok: false, error: 'Command failed' };
      }

      await saveToHistory(cwd, plan, applyResult);
      await clearPlan(cwd);
      applyLoader.succeed(`Applied ${applyResult.appliedCommits.length} commit(s)`);

      // 4. Push (optional)
      let pushed = false;
      if (withPush) {
        const pushLoader = useLoader('Pushing commits...');
        pushLoader.start();
        const pushResult = await pushCommits(scopeCwd);

        if (pushResult.success) {
          pushed = true;
          pushLoader.succeed(`Pushed to ${pushResult.remote}/${pushResult.branch}`);
        } else {
          pushLoader.fail(`Failed to push: ${pushResult.error}`);
        }
      }

      const output: CommitRunOutput = {
        plan,
        applied: true,
        pushed,
        commits: applyResult.appliedCommits.map((c) => ({
          id: c.groupId,
          sha: c.sha,
          message: c.message,
        })),
      };

      if (outputJson) {
        ctx.ui?.json?.(output);
      } else {
        const commitsItems = applyResult.appliedCommits.map((c) => {
          const shortSha = c.sha.substring(0, 7);
          const firstLine = c.message.split('\n')[0];
          return `[${shortSha}] ${firstLine}`;
        });

        const summaryItems: string[] = [
          `Commits: ${applyResult.appliedCommits.length}`,
          `Pushed: ${pushed ? 'Yes' : 'No'}`,
          `Scope: ${effectiveScope}`,
        ];

        if (plan.metadata.llmUsed) {
          const llmPhase = plan.metadata.escalated ? 'Phase 2' : 'Phase 1';
          summaryItems.push(`LLM: ${llmPhase}`);
          if (plan.metadata.tokensUsed) {
            summaryItems.push(`Tokens: ${plan.metadata.tokensUsed}`);
          }
        }

        const timing = Date.now() - startTime;
        ctx.ui?.success?.('Commits created successfully', {
          title: 'Git Commit',
          sections: [
            { header: 'Summary', items: summaryItems },
            { header: 'Commits Created', items: commitsItems },
          ],
          timing,
        });
      }

      return {
        ok: true,
        result: output,
        meta: { timing: Date.now() - startTime },
      };
    },
  },
});
