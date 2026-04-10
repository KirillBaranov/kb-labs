import type { QAResults, BaselineDiff, HistoryEntry, TrendResult, RegressionResult, BaselineSnapshot, GroupedResults } from '@kb-labs/qa-contracts';
import { getCheckLabel, getCheckIcon } from '@kb-labs/qa-contracts';

export interface ReportSection {
  header: string;
  lines: string[];
}

function icon(ct: string): string {
  return getCheckIcon(ct);
}

function label(ct: string): string {
  return getCheckLabel(ct);
}

/**
 * Build text report for a QA run.
 * Returns structured sections — CLI layer adds ANSI colors.
 */
function buildBaselineDiffLines(diff: BaselineDiff): string[] {
  const lines: string[] = [];
  for (const ct of Object.keys(diff)) {
    const d = diff[ct]!;
    if (d.newFailures.length > 0) {
      lines.push(`${icon(ct)} ${label(ct)}: +${d.newFailures.length} new failures`);
      for (const pkg of d.newFailures) { lines.push(`     - ${pkg}`); }
    }
    if (d.fixed.length > 0) {
      lines.push(`${icon(ct)} ${label(ct)}: -${d.fixed.length} fixed`);
    }
  }
  return lines;
}

export function buildRunReport(results: QAResults, diff?: BaselineDiff | null): ReportSection[] {
  const sections: ReportSection[] = [];

  const summaryLines: string[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  for (const ct of Object.keys(results)) {
    const r = results[ct]!;
    const total = r.passed.length + r.failed.length + r.skipped.length;
    const pct = total > 0 ? Math.round((r.passed.length / total) * 100) : 100;
    const status = r.failed.length === 0 ? 'PASS' : 'FAIL';
    summaryLines.push(`${status} ${icon(ct)}  ${label(ct).padEnd(12)} ${r.passed.length}/${total} passed (${pct}%)`);
    if (r.failed.length > 0) {
      for (const pkg of r.failed.slice(0, 5)) { summaryLines.push(`     - ${pkg}`); }
      if (r.failed.length > 5) { summaryLines.push(`     ... and ${r.failed.length - 5} more`); }
    }
    totalPassed += r.passed.length;
    totalFailed += r.failed.length;
    totalSkipped += r.skipped.length;
  }
  sections.push({ header: 'QA Summary Report', lines: summaryLines });

  if (diff) {
    const diffLines = buildBaselineDiffLines(diff);
    if (diffLines.length > 0) { sections.push({ header: 'Baseline Comparison', lines: diffLines }); }
  }

  sections.push({
    header: 'Totals',
    lines: [`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`],
  });

  return sections;
}

/**
 * Build history table for display.
 */
export function buildHistoryTable(history: HistoryEntry[], limit: number = 20): ReportSection[] {
  const entries = history.slice(-limit);
  const lines: string[] = [];

  for (const entry of entries) {
    const date = new Date(entry.timestamp).toLocaleDateString();
    const status = entry.status === 'passed' ? 'PASS' : 'FAIL';
    const summary = Object.keys(entry.summary).map((ct) => {
      const s = entry.summary[ct]!;
      return `${icon(ct)} ${s.failed}F`;
    }).join(' ');

    lines.push(`${date} ${entry.git.commit} ${status} ${summary} ${entry.git.message.slice(0, 40)}`);
  }

  return [{ header: `QA History (last ${entries.length})`, lines }];
}

/**
 * Build trends report.
 */
export function buildTrendsReport(trends: TrendResult[], history: HistoryEntry[]): ReportSection[] {
  if (trends.length === 0) {
    return [{ header: 'QA Trends', lines: ['Not enough history (need at least 2 entries)'] }];
  }

  const lines: string[] = [];
  for (const t of trends) {
    const arrow = t.delta > 0 ? `+${t.delta} (regression)` : t.delta < 0 ? `${t.delta} (improvement)` : '→ no change';
    lines.push(`${icon(t.checkType)} ${label(t.checkType).padEnd(12)} ${t.previous} → ${t.current}  ${arrow}`);
  }

  if (history.length >= 2) {
    const first = history[Math.max(0, history.length - 10)]!;
    const last = history[history.length - 1]!;
    lines.push('');
    lines.push(`Period: ${new Date(first.timestamp).toLocaleDateString()} → ${new Date(last.timestamp).toLocaleDateString()}`);
  }

  return [{ header: 'QA Trends', lines }];
}

/**
 * Build regressions report.
 */
export function buildRegressionsReport(result: RegressionResult, history: HistoryEntry[]): ReportSection[] {
  if (history.length < 2) {
    return [{ header: 'Regression Detection', lines: ['Not enough history (need at least 2 entries)'] }];
  }

  const prev = history[history.length - 2]!;
  const curr = history[history.length - 1]!;
  const lines: string[] = [
    `Comparing: ${prev.git.commit} → ${curr.git.commit}`,
    '',
  ];

  if (!result.hasRegressions) {
    lines.push('No regressions detected.');
    return [{ header: 'Regression Detection', lines }];
  }

  for (const r of result.regressions) {
    lines.push(`${r.checkType}: +${r.newFailures.length} new failures`);
    for (const pkg of r.newFailures) {
      lines.push(`  - ${pkg}`);
    }
  }

  lines.push('');
  lines.push('REGRESSIONS DETECTED!');

  return [{ header: 'Regression Detection', lines }];
}

/**
 * Build baseline status report.
 */
export function buildBaselineReport(baseline: BaselineSnapshot | null): ReportSection[] {
  if (!baseline) {
    return [{ header: 'Baseline Status', lines: ['No baseline captured yet. Run baseline:update first.'] }];
  }

  const lines: string[] = [
    `Captured: ${new Date(baseline.timestamp).toLocaleString()}`,
    `Git: ${baseline.git.commit} (${baseline.git.branch})`,
    '',
  ];

  for (const ct of Object.keys(baseline.results)) {
    const r = baseline.results[ct]!;
    lines.push(`${icon(ct)} ${label(ct).padEnd(12)} ${r.passed} passed, ${r.failed} failed`);
    if (r.failedPackages.length > 0) {
      const shown = r.failedPackages.slice(0, 3);
      for (const pkg of shown) {
        lines.push(`     - ${pkg}`);
      }
      if (r.failedPackages.length > 3) {
        lines.push(`     ... and ${r.failedPackages.length - 3} more`);
      }
    }
  }

  return [{ header: 'Baseline Status', lines }];
}

/**
 * Format a check status tag. Failed checks are UPPERCASED.
 */
function checkTag(status: 'passed' | 'failed' | 'skipped', ct: string): string {
  const short = ct === 'typeCheck' ? 'types' : ct;
  if (status === 'failed') {return short.toUpperCase();}
  if (status === 'skipped') {return `-${short}-`;}
  return short;
}

/**
 * Build a detailed report grouped by category → repo → packages.
 */
type PackageEntry = GroupedResults['categories'][string]['repos'][string]['packages'][number];

function getErrorPreview(raw: string): string {
  const errLines = raw.split('\n').filter((l) => l.trim().length > 0);
  for (const el of errLines) {
    const cleaned = el.replace(/^Command failed: .*/, '').trim();
    if (cleaned.length > 0) {
      return cleaned.replace(/\/[^\s]*\/kb-labs\//g, '').slice(0, 100);
    }
  }
  return '';
}

function renderPackageLines(pkg: PackageEntry, lines: string[]): void {
  const hasFail = Object.values(pkg.checks).some((v) => v === 'failed');
  const status = hasFail ? 'FAIL' : 'PASS';
  const tags = Object.keys(pkg.checks).map((ct) => checkTag(pkg.checks[ct]!, ct)).join(' ');
  lines.push(`    ${status} ${pkg.name.padEnd(40)} ${tags}`);
  if (hasFail) {
    for (const ct of Object.keys(pkg.checks)) {
      if (pkg.checks[ct] === 'failed') {
        const preview = getErrorPreview((pkg.errors[ct] ?? '').trim());
        lines.push(`         ${ct}: ${preview || 'failed'}`);
      }
    }
  }
}

function renderCategoryLines(catKey: string, grouped: GroupedResults): string[] {
  const cat = grouped.categories[catKey]!;
  const lines: string[] = [`PASS ${cat.summary.passed} | FAIL ${cat.summary.failed}`, ''];

  for (const repoKey of Object.keys(cat.repos).sort()) {
    const repo = cat.repos[repoKey]!;
    lines.push(`  ${repoKey} (${repo.summary.total} packages)`);

    const sorted = [...repo.packages].sort((a, b) => {
      const aFail = Object.values(a.checks).some((v) => v === 'failed') ? 0 : 1;
      const bFail = Object.values(b.checks).some((v) => v === 'failed') ? 0 : 1;
      if (aFail !== bFail) { return aFail - bFail; }
      return a.name.localeCompare(b.name);
    });

    for (const pkg of sorted) { renderPackageLines(pkg, lines); }
    lines.push('');
  }
  return lines;
}

export function buildDetailedRunReport(grouped: GroupedResults, diff?: BaselineDiff | null): ReportSection[] {
  const sections: ReportSection[] = [];

  const categoryKeys = Object.keys(grouped.categories).sort((a, b) => {
    if (a === 'uncategorized') { return 1; }
    if (b === 'uncategorized') { return -1; }
    return a.localeCompare(b);
  });

  for (const catKey of categoryKeys) {
    const cat = grouped.categories[catKey]!;
    sections.push({ header: `${cat.label} (${cat.summary.total} packages)`, lines: renderCategoryLines(catKey, grouped) });
  }

  if (diff) {
    const diffLines = buildBaselineDiffLines(diff);
    if (diffLines.length > 0) { sections.push({ header: 'Baseline Comparison', lines: diffLines }); }
  }

  let totalPassed = 0;
  let totalFailed = 0;
  for (const catKey of categoryKeys) {
    totalPassed += grouped.categories[catKey]!.summary.passed;
    totalFailed += grouped.categories[catKey]!.summary.failed;
  }
  sections.push({
    header: 'Totals',
    lines: [`Total: ${totalPassed} passed, ${totalFailed} failed (${categoryKeys.length} categories)`],
  });

  return sections;
}
