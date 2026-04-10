import type { QAResults, QAReport, BaselineDiff, GroupedResults } from '@kb-labs/qa-contracts';

/**
 * Build a structured JSON report from QA results.
 */
export function buildJsonReport(
  results: QAResults,
  diff?: BaselineDiff | null,
): QAReport {
  const hasFailures = Object.values(results).some((r) => r.failed.length > 0);

  const summary = {} as QAReport['summary'];
  const failures = {} as QAReport['failures'];
  const errors = {} as QAReport['errors'];

  for (const ct of Object.keys(results)) {
    const r = results[ct]!;
    const total = r.passed.length + r.failed.length + r.skipped.length;
    summary[ct] = {
      total,
      passed: r.passed.length,
      failed: r.failed.length,
      skipped: r.skipped.length,
    };
    failures[ct] = [...r.failed];
    errors[ct] = { ...r.errors };
  }

  return {
    status: hasFailures ? 'failed' : 'passed',
    timestamp: new Date().toISOString(),
    summary,
    failures,
    errors,
    baseline: diff ?? null,
  };
}

/**
 * Build a detailed JSON report with grouped results.
 */
export function buildDetailedJsonReport(
  results: QAResults,
  grouped: GroupedResults,
  diff?: BaselineDiff | null,
): QAReport & { grouped: GroupedResults } {
  const base = buildJsonReport(results, diff);
  return { ...base, grouped };
}
