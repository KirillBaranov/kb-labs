/**
 * @module @kb-labs/core-platform/runs/run-types
 * Full-cycle run state model and event schema.
 */

/**
 * Top-level full-cycle run status.
 */
export type RunStatus =
  | "queued"
  | "provisioning"
  | "executing"
  | "gating"
  | "human_review"
  | "finalizing"
  | "completed"
  | "failed"
  | "failed_by_review"
  | "cancelled";

/**
 * Run step status.
 */
export type RunStepStatus =
  | "pending"
  | "in_progress"
  | "retrying"
  | "skipped"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Run step definition.
 */
export interface RunStepDefinition {
  id: string;
  name: string;
  plugin?: string;
  action?: string;
  timeoutMs?: number;
  retryLimit?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Run creation request.
 */
export interface CreateRunRequest {
  taskRef: string;
  templateId: string;
  actorId?: string;
  tenantId?: string;
  priority?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}

/**
 * Run record.
 */
export interface RunRecord {
  runId: string;
  status: RunStatus;
  taskRef: string;
  templateId: string;
  actorId?: string;
  tenantId?: string;
  environmentId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run step record.
 */
export interface RunStepRecord {
  runId: string;
  stepId: string;
  status: RunStepStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run event type.
 */
export type RunEventType =
  | "run.created"
  | "run.status.changed"
  | "run.failed"
  | "run.completed"
  | "run.cancelled"
  | "run.review.approved"
  | "run.review.rejected"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "environment.provisioning"
  | "environment.ready"
  | "environment.destroyed";

/**
 * Timeline event for run auditability.
 */
export interface RunEvent {
  eventId: string;
  runId: string;
  type: RunEventType;
  at: string;
  fromStatus?: RunStatus;
  toStatus?: RunStatus;
  stepId?: string;
  environmentId?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

/**
 * Terminal run statuses.
 */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "completed",
  "failed",
  "failed_by_review",
  "cancelled",
]);

