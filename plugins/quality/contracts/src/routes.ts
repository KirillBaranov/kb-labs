/**
 * @module @kb-labs/quality-contracts/routes
 * REST API route constants for quality plugin
 */

/**
 * REST API base path for quality plugin
 */
export const QUALITY_BASE_PATH = '/v1/plugins/quality' as const;

/**
 * REST API route paths (relative to basePath)
 */
export const QUALITY_ROUTES = {
  /** GET /stats - Get monorepo statistics */
  STATS: '/stats',

  /** GET /health - Get health score */
  HEALTH: '/health',

  /** GET /dependencies - Get dependency issues */
  DEPENDENCIES: '/dependencies',

  /** GET /build-order - Get build order */
  BUILD_ORDER: '/build-order',

  /** GET /cycles - Get circular dependencies */
  CYCLES: '/cycles',

  /** GET /graph - Get dependency graph */
  GRAPH: '/graph',

  /** GET /stale - Get stale packages */
  STALE: '/stale',

  /** GET /builds - Get build status */
  BUILDS: '/builds',

  /** GET /types - Get type safety analysis */
  TYPES: '/types',

  /** GET /tests - Get test results and coverage */
  TESTS: '/tests',
} as const;

/**
 * Full REST API URLs (basePath + route)
 * Useful for testing and documentation
 */
export const QUALITY_FULL_ROUTES = {
  STATS: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.STATS}`,
  HEALTH: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.HEALTH}`,
  DEPENDENCIES: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.DEPENDENCIES}`,
  BUILD_ORDER: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.BUILD_ORDER}`,
  CYCLES: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.CYCLES}`,
  GRAPH: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.GRAPH}`,
  STALE: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.STALE}`,
  BUILDS: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.BUILDS}`,
  TYPES: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.TYPES}`,
  TESTS: `${QUALITY_BASE_PATH}${QUALITY_ROUTES.TESTS}`,
} as const;

export type QualityRoute = typeof QUALITY_ROUTES[keyof typeof QUALITY_ROUTES];
