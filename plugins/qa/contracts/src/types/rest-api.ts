/**
 * REST API Request/Response Types and Zod Schemas for QA Plugin
 */

import { z } from 'zod';

// ============================================================================
// Common schemas
// ============================================================================

const CheckTypeSchema = z.string();

const GitInfoSchema = z.object({
  commit: z.string(),
  branch: z.string(),
});

const GitInfoWithMessageSchema = GitInfoSchema.extend({
  message: z.string(),
});

const CheckSummarySchema = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

// ============================================================================
// Summary API
// ============================================================================

export const QASummaryRequestSchema = z.object({});

export type QASummaryRequest = z.infer<typeof QASummaryRequestSchema>;

export const QASummaryCheckSchema = z.object({
  checkType: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  total: z.number(),
});

export const QASummaryResponseSchema = z.object({
  status: z.string(),
  lastRunAt: z.string().nullable(),
  git: GitInfoWithMessageSchema.nullable(),
  checks: z.array(QASummaryCheckSchema),
  hasBaseline: z.boolean(),
  baselineTimestamp: z.string().nullable(),
  historyCount: z.number(),
});

export type QASummaryResponse = z.infer<typeof QASummaryResponseSchema>;

// ============================================================================
// Latest API
// ============================================================================

export const QALatestRequestSchema = z.object({});

export type QALatestRequest = z.infer<typeof QALatestRequestSchema>;

const HistoryEntrySchema = z.object({
  timestamp: z.string(),
  git: GitInfoWithMessageSchema,
  status: z.enum(['passed', 'failed']),
  summary: z.record(CheckTypeSchema, CheckSummarySchema),
  failedPackages: z.record(CheckTypeSchema, z.array(z.string())),
});

export const QALatestResponseSchema = z.object({
  entry: HistoryEntrySchema.nullable(),
});

export type QALatestResponse = z.infer<typeof QALatestResponseSchema>;

// ============================================================================
// History API
// ============================================================================

export const QAHistoryRequestSchema = z.object({
  limit: z.number().optional(),
});

export type QAHistoryRequest = z.infer<typeof QAHistoryRequestSchema>;

export const QAHistoryResponseSchema = z.object({
  entries: z.array(HistoryEntrySchema),
  total: z.number(),
});

export type QAHistoryResponse = z.infer<typeof QAHistoryResponseSchema>;

// ============================================================================
// Trends API
// ============================================================================

export const QATrendsRequestSchema = z.object({
  window: z.number().optional(),
  enriched: z.boolean().optional(),
});

export type QATrendsRequest = z.infer<typeof QATrendsRequestSchema>;

const TrendResultSchema = z.object({
  checkType: CheckTypeSchema,
  label: z.string().optional(),
  icon: z.string().optional(),
  previous: z.number(),
  current: z.number(),
  delta: z.number(),
  trend: z.enum(['regression', 'improvement', 'no-change']),
});

export const QATrendsResponseSchema = z.object({
  trends: z.array(TrendResultSchema),
  historyCount: z.number(),
  window: z.number(),
});

export type QATrendsResponse = z.infer<typeof QATrendsResponseSchema>;

// --- Enriched Trends ---

const TrendTimeSeriesPointSchema = z.object({
  timestamp: z.string(),
  gitCommit: z.string(),
  gitBranch: z.string(),
  gitMessage: z.string(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

const TrendChangelogEntrySchema = z.object({
  timestamp: z.string(),
  gitCommit: z.string(),
  gitMessage: z.string(),
  newFailures: z.array(z.string()),
  fixed: z.array(z.string()),
  delta: z.number(),
});

const EnrichedTrendResultSchema = z.object({
  checkType: CheckTypeSchema,
  label: z.string().optional(),
  icon: z.string().optional(),
  timeSeries: z.array(TrendTimeSeriesPointSchema),
  changelog: z.array(TrendChangelogEntrySchema),
  current: z.number(),
  previous: z.number(),
  delta: z.number(),
  trend: z.enum(['regression', 'improvement', 'no-change']),
  velocity: z.number(),
});

export const QAEnrichedTrendsResponseSchema = z.object({
  trends: z.array(EnrichedTrendResultSchema),
  historyCount: z.number(),
  window: z.number(),
});

export type QAEnrichedTrendsResponse = z.infer<typeof QAEnrichedTrendsResponseSchema>;

// ============================================================================
// Regressions API
// ============================================================================

export const QARegressionsRequestSchema = z.object({
  scope: z.string().optional(),
});

export type QARegressionsRequest = z.infer<typeof QARegressionsRequestSchema>;

const RegressionEntrySchema = z.object({
  checkType: z.string(),
  delta: z.number(),
  newFailures: z.array(z.string()),
});

export type RegressionEntry = z.infer<typeof RegressionEntrySchema>;

export const QARegressionsResponseSchema = z.object({
  hasRegressions: z.boolean(),
  regressions: z.array(RegressionEntrySchema),
  scope: z.string().optional(),
});


export type QARegressionsResponse = z.infer<typeof QARegressionsResponseSchema>;

// ============================================================================
// Baseline API
// ============================================================================

export const QABaselineRequestSchema = z.object({});

export type QABaselineRequest = z.infer<typeof QABaselineRequestSchema>;

const BaselineCheckSnapshotSchema = z.object({
  passed: z.number(),
  failed: z.number(),
  failedPackages: z.array(z.string()),
});

const BaselineSnapshotSchema = z.object({
  timestamp: z.string(),
  git: GitInfoSchema,
  results: z.record(CheckTypeSchema, BaselineCheckSnapshotSchema),
});

export const QABaselineResponseSchema = z.object({
  baseline: BaselineSnapshotSchema.nullable(),
});

export type QABaselineResponse = z.infer<typeof QABaselineResponseSchema>;

// ============================================================================
// Run API (POST)
// ============================================================================

const CheckResultSchema = z.object({
  passed: z.array(z.string()),
  failed: z.array(z.string()),
  skipped: z.array(z.string()),
  errors: z.record(z.string(), z.string()),
});

export const QARunRequestSchema = z.object({
  skipChecks: z.array(z.string()).optional(),
  saveToHistory: z.boolean().optional(),
});

export type QARunRequest = z.infer<typeof QARunRequestSchema>;

export const QARunResponseSchema = z.object({
  status: z.enum(['passed', 'failed']),
  results: z.record(CheckTypeSchema, CheckResultSchema),
  entry: HistoryEntrySchema.nullable(),
  durationMs: z.number(),
});

export type QARunResponse = z.infer<typeof QARunResponseSchema>;

// ============================================================================
// Details API (GET /details)
// ============================================================================

const SubmoduleInfoSchema = z.object({
  name: z.string(),
  commit: z.string(),
  branch: z.string(),
  dirty: z.boolean(),
  message: z.string(),
});

const PackageCheckDetailSchema = z.object({
  name: z.string(),
  repo: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  error: z.string().optional(),
  submodule: SubmoduleInfoSchema.optional(),
});

const CheckDetailsSchema = z.object({
  passed: z.array(PackageCheckDetailSchema),
  failed: z.array(PackageCheckDetailSchema),
  skipped: z.array(PackageCheckDetailSchema),
});

export const QADetailsRequestSchema = z.object({});

export type QADetailsRequest = z.infer<typeof QADetailsRequestSchema>;

export const QADetailsResponseSchema = z.object({
  timestamp: z.string().nullable(),
  git: GitInfoWithMessageSchema.nullable(),
  submodules: z.record(z.string(), SubmoduleInfoSchema).optional(),
  checks: z.record(CheckTypeSchema, CheckDetailsSchema),
});

export type QADetailsResponse = z.infer<typeof QADetailsResponseSchema>;

// ============================================================================
// Run Check API (POST /run/check)
// ============================================================================

export const QARunCheckRequestSchema = z.object({
  checkType: z.string(),
  repo: z.string().optional(),
  package: z.string().optional(),
});

export type QARunCheckRequest = z.infer<typeof QARunCheckRequestSchema>;

export const QARunCheckResponseSchema = z.object({
  checkType: CheckTypeSchema,
  status: z.enum(['passed', 'failed']),
  result: CheckResultSchema,
  durationMs: z.number(),
});

export type QARunCheckResponse = z.infer<typeof QARunCheckResponseSchema>;

// ============================================================================
// Baseline Update API (POST /baseline/update)
// ============================================================================

export const QABaselineUpdateRequestSchema = z.object({});

export type QABaselineUpdateRequest = z.infer<typeof QABaselineUpdateRequestSchema>;

export const QABaselineUpdateResponseSchema = z.object({
  success: z.boolean(),
  baseline: BaselineSnapshotSchema,
});

export type QABaselineUpdateResponse = z.infer<typeof QABaselineUpdateResponseSchema>;

// ============================================================================
// Baseline Diff API (GET /baseline/diff)
// ============================================================================

const CheckDiffSchema = z.object({
  newFailures: z.array(z.string()),
  fixed: z.array(z.string()),
  stillFailing: z.array(z.string()),
  delta: z.number(),
});

export const QABaselineDiffRequestSchema = z.object({});

export type QABaselineDiffRequest = z.infer<typeof QABaselineDiffRequestSchema>;

export const QABaselineDiffResponseSchema = z.object({
  hasDiff: z.boolean(),
  diff: z.record(CheckTypeSchema, CheckDiffSchema),
  baseline: BaselineSnapshotSchema.nullable(),
  current: z.object({
    timestamp: z.string(),
    summary: z.record(CheckTypeSchema, z.object({
      passed: z.number(),
      failed: z.number(),
    })),
  }).nullable(),
});

export type QABaselineDiffResponse = z.infer<typeof QABaselineDiffResponseSchema>;

// ============================================================================
// Package Timeline API (GET /packages/:name/timeline)
// ============================================================================

const PackageTimelineEntrySchema = z.object({
  timestamp: z.string(),
  git: GitInfoWithMessageSchema,
  submoduleCommit: z.string().optional(),
  checks: z.record(CheckTypeSchema, z.enum(['passed', 'failed', 'skipped'])),
});

export const QAPackageTimelineRequestSchema = z.object({});

export type QAPackageTimelineRequest = z.infer<typeof QAPackageTimelineRequestSchema>;

export const QAPackageTimelineResponseSchema = z.object({
  packageName: z.string(),
  repo: z.string(),
  entries: z.array(PackageTimelineEntrySchema),
  flakyScore: z.number(),
  flakyChecks: z.array(CheckTypeSchema),
  firstFailure: z.string().optional(),
  currentStreak: z.object({
    status: z.enum(['passing', 'failing']),
    count: z.number(),
  }),
});

export type QAPackageTimelineResponse = z.infer<typeof QAPackageTimelineResponseSchema>;

// ============================================================================
// Error Groups API (GET /errors/groups)
// ============================================================================

const ErrorGroupSchema = z.object({
  pattern: z.string(),
  count: z.number(),
  packages: z.array(z.string()),
  checkType: CheckTypeSchema,
  example: z.string(),
});

export const QAErrorGroupsRequestSchema = z.object({});

export type QAErrorGroupsRequest = z.infer<typeof QAErrorGroupsRequestSchema>;

export const QAErrorGroupsResponseSchema = z.object({
  groups: z.array(ErrorGroupSchema),
  ungrouped: z.number(),
});

export type QAErrorGroupsResponse = z.infer<typeof QAErrorGroupsResponseSchema>;
