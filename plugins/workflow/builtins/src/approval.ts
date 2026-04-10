/**
 * @module @kb-labs/workflow-builtins/approval
 * Types for builtin:approval step
 *
 * Approval steps pause the pipeline and wait for human decision.
 * The worker handles polling; resolveApproval() on the engine resumes execution.
 */

/**
 * Input for builtin:approval step (spec.with)
 */
export interface ApprovalInput {
  /** Display title for the approval request */
  title: string;

  /** Contextual data shown to the approver (already interpolated) */
  context?: Record<string, unknown>;

  /** Optional instructions for the approver */
  instructions?: string;
}

/**
 * Output produced by a resolved approval step
 */
export interface ApprovalOutput {
  /** Whether the approval was granted */
  approved: boolean;

  /** Action taken: "approve" or "reject" */
  action: 'approve' | 'reject';

  /** Optional comment from the approver */
  comment?: string;

  /** Additional data provided by the approver */
  [key: string]: unknown;
}
