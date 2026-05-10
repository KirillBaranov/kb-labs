import type { QAResults, QAReport, BaselineDiff, GroupedResults, QACheckConfig, ReportCheckFindings } from '@kb-labs/qa-contracts';

/**
 * Build a structured JSON report from QA results.
 * Pass checks config to populate blockers/warnings with severity info.
 */
export function buildJsonReport(
  results: QAResults,
  diff?: BaselineDiff | null,
  checks?: QACheckConfig[],
): QAReport {
  // Build severity map from check config (default: blocker)
  const severityMap: Record<string, 'blocker' | 'warning' | 'info'> = {};
  if (checks) {
    for (const c of checks) {
      severityMap[c.id] = c.severity ?? 'blocker';
    }
  }

  // Only non-info failures affect status
  const hasBlockerFailures = Object.entries(results).some(([ct, r]) => {
    const sev = severityMap[ct] ?? 'blocker';
    return sev !== 'info' && sev !== 'warning' && r.failed.length > 0;
  });

  const summary = {} as QAReport['summary'];
  const failures = {} as QAReport['failures'];
  const errors = {} as QAReport['errors'];
  const blockers: ReportCheckFindings[] = [];
  const warnings: ReportCheckFindings[] = [];

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

    if (r.failed.length > 0) {
      const sev = severityMap[ct] ?? 'blocker';
      // Collect structured items from details, or synthesize from errors
      const items = r.failed.flatMap(target => {
        const detailItems = r.details?.[target];
        if (detailItems && detailItems.length > 0) { return detailItems; }
        const msg = r.errors[target];
        return msg ? [{ target, message: msg }] : [{ target, message: `check ${ct} failed` }];
      });

      if (sev === 'blocker') {
        blockers.push({ check: ct, items });
      } else if (sev === 'warning') {
        warnings.push({ check: ct, items });
      }
      // info: skip
    }
  }

  return {
    status: hasBlockerFailures ? 'failed' : 'passed',
    timestamp: new Date().toISOString(),
    summary,
    failures,
    errors,
    baseline: diff ?? null,
    blockers,
    warnings,
  };
}

/**
 * Build a detailed JSON report with grouped results.
 */
export function buildDetailedJsonReport(
  results: QAResults,
  grouped: GroupedResults,
  diff?: BaselineDiff | null,
  checks?: QACheckConfig[],
): QAReport & { grouped: GroupedResults } {
  const base = buildJsonReport(results, diff, checks);
  return { ...base, grouped };
}
