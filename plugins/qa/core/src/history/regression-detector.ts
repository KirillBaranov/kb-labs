import type { HistoryEntry, RegressionResult } from '@kb-labs/qa-contracts';

/**
 * Detect regressions by comparing the last 2 history entries.
 * A regression = new packages failing that weren't failing before.
 */
export function detectRegressions(history: HistoryEntry[]): RegressionResult {
  if (history.length < 2) {
    return { hasRegressions: false, regressions: [] };
  }

  const previous = history[history.length - 2]!;
  const current = history[history.length - 1]!;

  const regressions: RegressionResult['regressions'] = [];

  const checkTypes = [...new Set([...Object.keys(previous.failedPackages), ...Object.keys(current.failedPackages)])];

  for (const ct of checkTypes) {
    const prevFailed = new Set(previous.failedPackages[ct] ?? []);
    const currFailed = current.failedPackages[ct] ?? [];

    const newFailures = currFailed.filter((p) => !prevFailed.has(p));
    const delta = currFailed.length - prevFailed.size;

    if (newFailures.length > 0) {
      regressions.push({
        checkType: ct,
        delta,
        newFailures,
      });
    }
  }

  return {
    hasRegressions: regressions.length > 0,
    regressions,
  };
}
