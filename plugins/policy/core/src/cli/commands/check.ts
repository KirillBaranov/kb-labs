import { defineCommand, useConfig, findRepoRoot, type PluginContextV3 } from '@kb-labs/sdk';
import { execSync } from 'node:child_process';
import type { PolicyConfig, CheckReport } from '@kb-labs/policy-contracts';
import { detectCategory } from '../../core/category-resolver.js';
import { runChecks } from '../../core/policy-runner.js';

type CheckInput = {
  path?: string;
  json?: boolean;
};

type CheckResult = {
  exitCode: number;
  report: CheckReport;
};

export default defineCommand({
  id: 'policy:check',
  description: 'Run policy checks for changed repos or a specific path. Exits with code 1 on violations.',

  handler: {
    async execute(ctx: PluginContextV3, input: CheckInput): Promise<CheckResult> {
      const flags = (input as { flags?: CheckInput }).flags ?? input;
      const workspaceRoot = (await findRepoRoot(ctx.cwd)) ?? ctx.cwd;
      const policyConfig = await useConfig<PolicyConfig>();

      if (!policyConfig?.categories) {
        ctx.ui.error('No policies config found in .kb/kb.config.json (expected "policies" key)');
        const emptyReport: CheckReport = {
          passed: false,
          repos: [],
          summary: { total: 0, passed: 0, failed: 0, violations: 0 },
        };
        if (flags.json) {ctx.ui.json?.({ passed: false, error: 'No policies config' });}
        return { exitCode: 1, report: emptyReport };
      }

      const repoPaths = flags.path
        ? [flags.path]
        : detectChangedRepos(workspaceRoot);

      const repos = repoPaths.map((p) => detectCategory(p, policyConfig));

      // Warn about repos with no category
      for (const r of repos) {
        if (!r.category) {
          ctx.ui.warn?.(`Repo ${r.path} has no category — applying default rules: ${r.rules.join(', ')}`);
        }
      }

      const report = await runChecks(repos, policyConfig, workspaceRoot);

      if (flags.json) {
        ctx.ui.json?.(report);
      } else {
        renderHumanReport(ctx, report);
      }

      return { exitCode: report.passed ? 0 : 1, report };
    },
  },
});

function renderHumanReport(ctx: PluginContextV3, report: CheckReport): void {
  const lines: string[] = [];

  for (const repo of report.repos) {
    const cat = repo.category ?? '(no category)';
    lines.push(`\n${repo.path} (category: ${cat})`);

    for (const violation of repo.violations) {
      lines.push(`  ❌ ${violation.rule}`);
      lines.push(`     ${violation.message}`);
      if (violation.detail) {lines.push(`     → ${violation.detail}`);}
    }
    for (const passed of repo.passed) {
      lines.push(`  ✅ ${passed}`);
    }
  }

  const { total, passed, failed, violations } = report.summary;
  const summaryLine = report.passed
    ? `✅ All ${total} repo(s) passed`
    : `❌ ${violations} violation(s) found in ${failed}/${total} repo(s) — pipeline blocked`;

  if (report.passed) {
    ctx.ui.success?.('Policy Check', {
      sections: [
        { header: 'Results', items: lines },
        { header: 'Summary', items: [`${passed}/${total} passed`] },
      ],
    });
  } else {
    ctx.ui.error(`Policy Check Failed\n${lines.join('\n')}\n\n${summaryLine}`);
  }
}

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
