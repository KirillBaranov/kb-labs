// Devkit integration
export { resolveDevkitBin } from './devkit/devkit-discovery.js';
export { DevkitAdapter } from './devkit/devkit-adapter.js';
export { captureGit } from './devkit/git-capture.js';
export type { DevkitAdapterOptions } from './devkit/devkit-adapter.js';

// Snapshot store
export { SnapshotStore } from './snapshot/snapshot-store.js';

// Analysis
export { analyzeTrends } from './analysis/trend-analyzer.js';
export { detectRegressions } from './analysis/regression-detector.js';
export { compareWithBaseline } from './analysis/baseline-comparator.js';
export { buildPackageTimeline } from './analysis/package-timeline.js';
export { buildCaseTimeline, analyzeFlakyCases, caseKeyOf } from './analysis/case-timeline.js';

// Report
export type { ReportSection } from './report/index.js';
export {
  formatTaskName,
  buildRunReport,
  buildCheckReport,
  buildStatsReport,
  buildHistoryTable,
  buildTrendsReport,
  buildRegressionsReport,
  buildBaselineReport,
  buildBaselineDiffReport,
  buildRunJsonReport,
  buildCheckJsonReport,
  buildStatsJsonReport,
} from './report/index.js';
