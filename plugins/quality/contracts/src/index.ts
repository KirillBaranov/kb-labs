/**
 * @kb-labs/quality-contracts
 *
 * Type-safe contracts for Quality Plugin
 * Types, schemas, and constants for monorepo analysis and quality checks
 */

// Common types
export type {
  PackageInfo,
  RepositoryInfo,
  IssueSeverity,
  Issue,
  Recommendation,
  BuildCheckResult,
  TypeAnalysisResult,
  TestRunResult,
} from './types/common.js';

// Stats types
export type {
  HealthScore,
  PackageStats,
  RepositoryStats,
  DependencyStats,
  StatsResult,
} from './types/stats.js';

// Constants
export {
  QUALITY_ENV_VARS,
  QUALITY_CACHE_PREFIX,
  CACHE_KEYS,
  DEFAULT_TIMEOUTS,
  HEALTH_GRADES,
} from './constants.js';

// Routes
export {
  QUALITY_BASE_PATH,
  QUALITY_ROUTES,
  QUALITY_FULL_ROUTES,
} from './routes.js';
export type { QualityRoute } from './routes.js';

// Dead code types
export type {
  AliveReason,
  DeadFile,
  PackageDeadCodeResult,
  DeadCodeResult,
  DeadCodeOptions,
  DeadCodeBackupManifest,
  DeadCodeRemovalResult,
} from './types/dead-code.js';

// REST API types and schemas
export * from './types/rest-api.js';
