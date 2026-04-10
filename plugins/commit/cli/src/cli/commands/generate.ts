/**
 * commit:generate command
 * Generate commit plan from git changes
 */

import {
  defineCommand,
  useLLM,
  useLoader,
  useConfig,
  findRepoRoot,
  displayArtifacts,
  type PluginContextV3,
  type ArtifactInfo,
} from '@kb-labs/sdk';
import { stat } from 'node:fs/promises';
import {
  generateCommitPlan,
  savePlan,
  hasChanges,
  getGitStatus,
  getCurrentPlanPath,
} from '@kb-labs/commit-core';
import {
  type GenerateOutput,
  type CommitPluginConfig,
  resolveCommitConfig,
  type GenerateFlags,
  commitEnv,
} from '@kb-labs/commit-contracts';
import { resolveScopePath } from '../../rest/handlers/scope-resolver';

// Input type with V3 handler compatibility
// V3 handlers receive flags either in input.flags (CLI) or directly in input (REST API)
type GenerateInput = GenerateFlags & {
  argv?: string[];
  flags?: GenerateFlags;
};

type GenerateResult = {
  exitCode: number;
  result?: GenerateOutput;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'commit:generate',
  description: 'Generate commit plan from git changes',

  handler: {
    async execute(ctx: PluginContextV3, input: GenerateInput): Promise<GenerateResult> {
      const startTime = Date.now();
      const llm = useLLM();
      const cwd = (await findRepoRoot(ctx.cwd || process.cwd())) ?? process.cwd();

      // Load config from kb.config.json + env overrides
      const fileConfig = await useConfig<Partial<CommitPluginConfig>>();

      // V3: Parse env variables with type safety and validation
      const env = commitEnv.parse(ctx.runtime);

      const config = resolveCommitConfig(fileConfig ?? {}, env);

      // V3: Flags come in input.flags (CLI) or directly in input (REST API)
      const flags = input.flags ?? input;
      const effectiveScope = flags.scope ?? config.scope?.default ?? 'root';
      const scopeCwd = resolveScopePath(cwd, effectiveScope, config.scope?.scopes);
      const allowSecrets = flags['allow-secrets'] ?? false;
      const autoConfirm = flags.yes ?? false;

      // Check for changes (with scope for nested repos)
      const statusLoader = useLoader('Checking git status...');
      statusLoader.start();
      const status = await getGitStatus(scopeCwd);

      if (!hasChanges(status)) {
        statusLoader.stop();
        ctx.ui?.warn?.('No changes to commit');
        return {
          exitCode: 1,
        };
      }
      statusLoader.succeed('Found changes to commit');

      // Generate plan
      const analyzeLoader = useLoader('Analyzing changes...');
      analyzeLoader.start();

      // Create LLM wrapper with config values
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

      const plan = await generateCommitPlan({
        cwd: scopeCwd,
        llmComplete,
        config,
        allowSecrets,
        autoConfirm,
        onProgress: (message) => analyzeLoader.update({ text: message }),
      });

      // Save plan
      const saveLoader = useLoader('Saving plan...');
      saveLoader.start();
      await savePlan(cwd, plan, effectiveScope);
      const planPath = getCurrentPlanPath(cwd, effectiveScope);
      saveLoader.succeed('Plan saved');

      analyzeLoader.succeed(`Generated commit plan with ${plan.commits.length} commit(s)`);

      // Output
      const output: GenerateOutput = {
        plan,
        planPath,
      };

      // V3: Flags are auto-merged by bootstrap.ts, just use directly
      if (input.json) {
        ctx.ui?.json?.(output);
      } else {
        // Build commits section
        const commitsItems = plan.commits.map((commit) => {
          const scope = commit.scope ? `(${commit.scope})` : '';
          return `${commit.type}${scope}: ${commit.message} [${commit.files.length} file(s)]`;
        });

        // Build artifacts section
        const artifacts: ArtifactInfo[] = [];
        try {
          const planStats = await stat(planPath);
          artifacts.push({
            name: 'Commit Plan',
            path: planPath,
            size: planStats.size,
            modified: planStats.mtime,
            description: 'Generated commit plan in JSON format',
          });
        } catch {
          // Ignore stat errors
        }

        const sections: Array<{ header?: string; items: string[] }> = [];

        // Add commits section
        if (commitsItems.length > 0) {
          sections.push({
            header: 'Commits',
            items: commitsItems,
          });
        }

        // Add artifacts section
        if (artifacts.length > 0) {
          const artifactsLines = displayArtifacts(artifacts, {
            showSize: true,
            showTime: true,
            showDescription: true,
            maxItems: 10,
            title: '',
          });
          sections.push({
            header: 'Artifacts',
            items: artifactsLines,
          });
        }

        // Build summary section
        const summaryItems: string[] = [
          `Files: ${plan.metadata.totalFiles}`,
          `Commits: ${plan.metadata.totalCommits}`,
        ];

        if (plan.metadata.llmUsed) {
          const llmPhase = plan.metadata.escalated ? 'Phase 2 (with diff)' : 'Phase 1';
          summaryItems.push(`LLM: ${llmPhase}`);
          if (plan.metadata.tokensUsed) {
            summaryItems.push(`Tokens: ${plan.metadata.tokensUsed}`);
          }
        } else {
          summaryItems.push('Generator: Heuristics');
        }

        sections.unshift({
          header: 'Summary',
          items: summaryItems,
        });

        const timing = Date.now() - startTime;

        ctx.ui?.success?.('Plan generated and saved', {
          title: 'Generate Commit Plan',
          sections,
          timing,
        });
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
