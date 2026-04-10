import type { QAResults, BaselineSnapshot, BaselineDiff } from '@kb-labs/qa-contracts';

/**
 * Compare current QA results with a baseline snapshot.
 * Returns per-check-type diff with newFailures, fixed, stillFailing, delta.
 */
export function compareWithBaseline(
  results: QAResults,
  baseline: BaselineSnapshot,
): BaselineDiff {
  const diff = {} as BaselineDiff;

  const checkTypes = [...new Set([...Object.keys(results), ...Object.keys(baseline.results)])];

  for (const ct of checkTypes) {
    const current = new Set(results[ct]?.failed ?? []);
    const baselineFailed = new Set(baseline.results[ct]?.failedPackages ?? []);

    const newFailures = [...current].filter((p) => !baselineFailed.has(p));
    const fixed = [...baselineFailed].filter((p) => !current.has(p));
    const stillFailing = [...current].filter((p) => baselineFailed.has(p));

    diff[ct] = {
      newFailures,
      fixed,
      stillFailing,
      delta: current.size - baselineFailed.size,
    };
  }

  return diff;
}
