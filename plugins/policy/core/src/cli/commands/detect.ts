import { defineCommand, useConfig, findRepoRoot, type PluginContextV3 } from '@kb-labs/sdk';
import { execSync } from 'node:child_process';
import type { PolicyConfig, CategoryResult } from '@kb-labs/policy-contracts';
import { detectCategory } from '../../core/category-resolver.js';

type DetectInput = {
  path?: string;
  json?: boolean;
};

type DetectResult = {
  exitCode: number;
  repos: CategoryResult[];
};

export default defineCommand({
  id: 'policy:detect',
  description: 'Detect the policy category for repos based on changed files or a specific path',

  handler: {
    async execute(ctx: PluginContextV3, input: DetectInput): Promise<DetectResult> {
      const flags = (input as { flags?: DetectInput }).flags ?? input;
      const workspaceRoot = (await findRepoRoot(ctx.cwd)) ?? ctx.cwd;
      const policyConfig = await useConfig<PolicyConfig>();

      if (!policyConfig?.categories) {
        ctx.ui.error('No policies config found in .kb/kb.config.json (expected "policies" key)');
        return { exitCode: 1, repos: [] };
      }

      const repoPaths = flags.path
        ? [flags.path]
        : detectChangedRepos(workspaceRoot);

      const repos = repoPaths.map((p) => detectCategory(p, policyConfig));

      if (flags.json) {
        ctx.ui.json?.({ repos });
      } else {
        if (repos.length === 0) {
          ctx.ui.info?.('No repos detected');
        } else {
          const lines = repos.map((r) => {
            const cat = r.category ?? '(no category — using defaults)';
            const warn = !r.category ? ' ⚠️' : '';
            return `  ${r.path}  →  ${cat}  [${r.rules.join(', ')}]${warn}`;
          });
          ctx.ui.success?.('Policy Detect', { sections: [{ header: 'Repos', items: lines }] });
        }
      }

      return { exitCode: 0, repos };
    },
  },
});

function detectChangedRepos(workspaceRoot: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });

    const repoSet = new Set<string>();
    for (const file of output.trim().split('\n').filter(Boolean)) {
      const parts = file.split('/');
      if (parts.length >= 2) {
        const topDir = parts[0]!;
        const repoDir = parts[1]!;
        if (['platform', 'plugins', 'infra', 'templates', 'installer', 'sites'].includes(topDir)) {
          repoSet.add(`${topDir}/${repoDir}`);
        }
      }
    }
    return Array.from(repoSet);
  } catch {
    return [];
  }
}
