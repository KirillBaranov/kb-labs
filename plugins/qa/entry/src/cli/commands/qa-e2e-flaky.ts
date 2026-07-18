import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  captureGit,
  analyzeFlakyCases,
  buildCaseTimeline,
} from '@kb-labs/qa-core';
import { PATHS, TRENDS_WINDOW, type QAPluginConfig, type E2eCaseResult } from '@kb-labs/qa-contracts';
import type { QaE2eFlakyFlags } from './flags.js';

async function runIngest(
  ctx: PluginContextV3,
  cwd: string,
  store: SnapshotStore,
  dir: string,
): Promise<{ exitCode: number }> {
  const cases: E2eCaseResult[] = [];
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = entry.isDirectory()
        ? join(dir, entry.name, 'flaky-report.json')
        : entry.name === 'flaky-report.json' ? join(dir, entry.name) : null;
      if (!file || !existsSync(file)) {continue;}
      try {
        cases.push(...(JSON.parse(readFileSync(file, 'utf-8')) as E2eCaseResult[]));
      } catch {
        // A crashed/partial shard shouldn't block ingesting the rest.
      }
    }
  }

  const git = await captureGit(ctx.api.shell, cwd);
  const snap = store.saveE2eFlaky(cases, 0, git);
  ctx.ui?.success?.(`Ingested ${cases.length} e2e case result(s) from ${dir} into flaky history`, {});
  ctx.ui?.json?.(snap);
  return { exitCode: 0 };
}

async function runSync(ctx: PluginContextV3, cwd: string): Promise<boolean> {
  const fetch = await ctx.api.shell.exec('git', ['fetch', 'origin', 'ci-data'], { cwd, throwOnError: false });
  if (!fetch.ok) {
    ctx.ui?.error?.('No flaky history yet — the "ci-data" branch has not been created by CI.');
    return false;
  }
  const show = await ctx.api.shell.exec(
    'git',
    ['show', `origin/ci-data:${PATHS.SNAPSHOTS_E2E_FLAKY}`],
    { cwd, throwOnError: false },
  );
  if (!show.ok) {
    ctx.ui?.error?.('No flaky history yet — "ci-data" branch exists but has no snapshot file.');
    return false;
  }
  const target = join(cwd, PATHS.SNAPSHOTS_E2E_FLAKY);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, show.stdout);
  return true;
}

export default defineCommand<unknown, CLIInput<QaE2eFlakyFlags>, { exitCode: number }>({
  id: 'qa:e2e-flaky',
  description: 'Track flaky e2e cases across CI runs — compact overview by default, per-case drill-down on request',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaE2eFlakyFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const json = flags.agent || flags.json;

      if (flags.ingest) {
        return runIngest(ctx, cwd, store, flags.ingest);
      }

      if (flags.sync) {
        const synced = await runSync(ctx, cwd);
        if (!synced) {return { exitCode: 1 };}
      }

      const history = store.loadE2eFlakyHistory();
      const window = flags.window ?? TRENDS_WINDOW;

      if (flags.case) {
        const timeline = buildCaseTimeline(history.slice(-window), flags.case);
        if (!timeline) {
          ctx.ui?.error?.(`No history found for case "${flags.case}". Run with --agent to see the "top" list of known cases.`);
          return { exitCode: 1 };
        }
        if (json) {
          ctx.ui?.json?.(timeline);
        } else {
          ctx.ui?.success?.(`Case timeline: ${timeline.caseKey}`, {
            sections: [
              { header: 'Summary', items: [
                `flakyScore: ${timeline.flakyScore}`,
                `streak: ${timeline.currentStreak.status} x${timeline.currentStreak.count}`,
                `firstFailure: ${timeline.firstFailure ?? 'none'}`,
              ] },
              { header: 'History', items: timeline.history.map(
                h => `${h.timestamp} [${h.gitCommit}] ${h.status}${h.errorCategory ? ` (${h.errorCategory}: ${h.errorMessage ?? ''})` : ''}`,
              ) },
            ],
          });
        }
        return { exitCode: 0 };
      }

      const overview = analyzeFlakyCases(history, window);
      if (json) {
        ctx.ui?.json?.(overview);
      } else {
        ctx.ui?.success?.(`E2E flaky overview (last ${overview.runsAnalyzed} runs)`, {
          sections: [
            { header: 'Summary', items: [
              `totalCases: ${overview.totalCases}, flakyCases: ${overview.flakyCases}`,
              `delta: +${overview.delta.new.length} new, -${overview.delta.fixed.length} fixed, ${overview.delta.unchanged.length} unchanged`,
            ] },
            { header: 'Top flaky cases', items: overview.top.map(
              t => `${t.case} — score ${t.flakyScore}, ${t.streak}, ${t.category}`,
            ) },
          ],
        });
      }
      return { exitCode: 0 };
    },
  },
});
