import type { HistoryEntry, CheckType } from '@kb-labs/qa-contracts';
import type { PackageTimelineEntry, PackageTimelineResponse } from '@kb-labs/qa-contracts';

function buildEntries(history: HistoryEntry[], packageName: string): { entries: PackageTimelineEntry[]; repo: string } {
  let repo = 'unknown';
  const entries: PackageTimelineEntry[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    const checks: Record<string, 'passed' | 'failed' | 'skipped'> = {};
    let found = false;

    for (const ct of Object.keys(h.summary)) {
      const failedList = h.failedPackages[ct] ?? [];
      const summaryEntry = h.summary[ct];
      if (failedList.includes(packageName)) {
        checks[ct] = 'failed'; found = true;
      } else if (summaryEntry && (summaryEntry.passed > 0 || summaryEntry.failed > 0)) {
        checks[ct] = 'passed'; found = true;
      } else {
        checks[ct] = 'skipped';
      }
    }

    if (!found) { continue; }

    let submoduleCommit: string | undefined;
    if (h.submodules) {
      for (const [repoName, info] of Object.entries(h.submodules)) {
        if (repoName === repo || repo === 'unknown') {
          submoduleCommit = info.commit;
          if (repo === 'unknown') { repo = repoName; }
        }
      }
    }

    entries.push({
      timestamp: h.timestamp,
      git: h.git,
      submoduleCommit,
      checks: checks as Record<CheckType, 'passed' | 'failed' | 'skipped'>,
    });
  }

  return { entries, repo };
}

function computeFlakyScore(entries: PackageTimelineEntry[]): { flakyScore: number; flakyChecks: CheckType[] } {
  const allCheckTypes = new Set<string>();
  for (const entry of entries) {
    for (const k of Object.keys(entry.checks)) { allCheckTypes.add(k); }
  }

  const flakyChecks: CheckType[] = [];
  let totalFlips = 0;
  let totalTransitions = 0;

  for (const ct of allCheckTypes) {
    let flips = 0;
    let transitions = 0;
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1]!.checks[ct];
      const curr = entries[i]!.checks[ct];
      if (prev === 'skipped' || curr === 'skipped' || !prev || !curr) { continue; }
      transitions++;
      if (prev !== curr) { flips++; }
    }
    if (transitions > 0 && flips / transitions > 0.3) { flakyChecks.push(ct as CheckType); }
    totalFlips += flips;
    totalTransitions += transitions;
  }

  return {
    flakyScore: totalTransitions > 0 ? Math.min(1, totalFlips / totalTransitions) : 0,
    flakyChecks,
  };
}

function computeStreak(entries: PackageTimelineEntry[]): { status: 'passing' | 'failing'; count: number } {
  const latest = entries[0];
  if (!latest) { return { status: 'passing', count: 0 }; }

  const streakStatus: 'passing' | 'failing' = Object.values(latest.checks).some((v) => v === 'failed') ? 'failing' : 'passing';
  let count = 1;
  for (let i = 1; i < entries.length; i++) {
    const eFail = Object.values(entries[i]!.checks).some((v) => v === 'failed');
    if ((eFail ? 'failing' : 'passing') !== streakStatus) { break; }
    count++;
  }
  return { status: streakStatus, count };
}

/**
 * Build a timeline for a specific package across QA history.
 * Computes flaky score, current streak, and first failure timestamp.
 */
export function getPackageTimeline(
  history: HistoryEntry[],
  packageName: string,
): PackageTimelineResponse {
  const { entries, repo } = buildEntries(history, packageName);
  const { flakyScore, flakyChecks } = computeFlakyScore(entries);

  let firstFailure: string | undefined;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (Object.values(entries[i]!.checks).some((v) => v === 'failed')) {
      firstFailure = entries[i]!.timestamp;
    }
  }

  return {
    packageName,
    repo,
    entries,
    flakyScore: Math.round(flakyScore * 100) / 100,
    flakyChecks,
    firstFailure,
    currentStreak: computeStreak(entries),
  };
}
