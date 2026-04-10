/**
 * @module @kb-labs/qa-contracts/routes
 * REST API route constants for QA plugin
 */

/**
 * REST API base path for QA plugin
 */
export const QA_BASE_PATH = '/v1/plugins/qa' as const;

/**
 * REST API route paths (relative to basePath)
 */
export const QA_ROUTES = {
  /** GET /summary - Aggregated QA overview */
  SUMMARY: '/summary',

  /** GET /latest - Last QA run result */
  LATEST: '/latest',

  /** GET /history - QA run history */
  HISTORY: '/history',

  /** GET /trends - Trend analysis */
  TRENDS: '/trends',

  /** GET /regressions - Regression detection */
  REGRESSIONS: '/regressions',

  /** GET /baseline - Current baseline snapshot */
  BASELINE: '/baseline',

  /** POST /run - Run QA checks */
  RUN: '/run',

  /** GET /details - Per-package details with errors from last run */
  DETAILS: '/details',

  /** POST /run/check - Run a single check type */
  RUN_CHECK: '/run/check',

  /** POST /baseline/update - Update baseline from last run */
  BASELINE_UPDATE: '/baseline/update',

  /** GET /baseline/diff - Diff current state vs baseline */
  BASELINE_DIFF: '/baseline/diff',

  /** GET /packages/:name/timeline - Per-package QA history timeline */
  PACKAGE_TIMELINE: '/packages/:name/timeline',

  /** GET /errors/groups - Grouped errors by pattern */
  ERROR_GROUPS: '/errors/groups',
} as const;

/**
 * Full REST API URLs (basePath + route)
 * Useful for testing and documentation
 */
export const QA_FULL_ROUTES = {
  SUMMARY: `${QA_BASE_PATH}${QA_ROUTES.SUMMARY}`,
  LATEST: `${QA_BASE_PATH}${QA_ROUTES.LATEST}`,
  HISTORY: `${QA_BASE_PATH}${QA_ROUTES.HISTORY}`,
  TRENDS: `${QA_BASE_PATH}${QA_ROUTES.TRENDS}`,
  REGRESSIONS: `${QA_BASE_PATH}${QA_ROUTES.REGRESSIONS}`,
  BASELINE: `${QA_BASE_PATH}${QA_ROUTES.BASELINE}`,
  RUN: `${QA_BASE_PATH}${QA_ROUTES.RUN}`,
  DETAILS: `${QA_BASE_PATH}${QA_ROUTES.DETAILS}`,
  RUN_CHECK: `${QA_BASE_PATH}${QA_ROUTES.RUN_CHECK}`,
  BASELINE_UPDATE: `${QA_BASE_PATH}${QA_ROUTES.BASELINE_UPDATE}`,
  BASELINE_DIFF: `${QA_BASE_PATH}${QA_ROUTES.BASELINE_DIFF}`,
  PACKAGE_TIMELINE: `${QA_BASE_PATH}${QA_ROUTES.PACKAGE_TIMELINE}`,
  ERROR_GROUPS: `${QA_BASE_PATH}${QA_ROUTES.ERROR_GROUPS}`,
} as const;

export type QARoute = typeof QA_ROUTES[keyof typeof QA_ROUTES];
