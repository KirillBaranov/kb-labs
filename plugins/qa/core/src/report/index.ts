export { buildJsonReport, buildDetailedJsonReport } from './json-reporter.js';
export {
  buildRunReport,
  buildDetailedRunReport,
  buildHistoryTable,
  buildTrendsReport,
  buildRegressionsReport,
  buildBaselineReport,
} from './text-reporter.js';
export type { ReportSection } from './text-reporter.js';
export { groupResults } from './grouped-reporter.js';
export { groupErrors } from './error-grouping.js';
