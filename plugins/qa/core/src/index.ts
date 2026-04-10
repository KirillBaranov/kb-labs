// Runner
export { runQA, getWorkspacePackages, getSubmoduleInfo, collectSubmoduleInfo, saveLastRun, loadLastRun } from './runner/index.js';
export type { LastRunData } from './runner/index.js';

// Individual runners (for single-check execution)
export { runLintCheck } from './runner/index.js';
export { runTypeCheck } from './runner/index.js';
export { runTestCheck } from './runner/index.js';

// Baseline
export { loadBaseline, saveBaseline, captureBaseline, createBaselineFromResults, compareWithBaseline } from './baseline/index.js';

// History
export { loadHistory, saveHistory, createHistoryEntry, appendEntry, analyzeTrends, analyzeEnrichedTrends, detectRegressions, getPackageTimeline } from './history/index.js';

// Report
export { buildJsonReport, buildDetailedJsonReport, buildRunReport, buildDetailedRunReport, buildHistoryTable, buildTrendsReport, buildRegressionsReport, buildBaselineReport, groupResults, groupErrors } from './report/index.js';
export type { ReportSection } from './report/index.js';

// Categories
export { resolveCategories } from './categories/index.js';
