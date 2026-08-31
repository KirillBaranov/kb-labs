/**
 * The single human approval per operation (execution plan §3.4, PR 5 item 2).
 *
 * ## Why this is not a boolean
 *
 * The work order's explicit "Нельзя" is: *представлять approval изменяемым
 * булевым входом*. A boolean input answers "may I proceed"; it cannot answer
 * "who approved, when, and over exactly which bytes" — and the third part is the
 * one that matters, because §3.4 moved the approval to *after* sealing precisely
 * so the operator signs artifacts that already exist. An approval that does not
 * name a `bundleSha256` would put us back where we started: signing a promise.
 *
 * So an approval is a document with a digest over its subject, recorded as an
 * immutable receipt transition carrying actor and time. Re-reading it re-derives
 * the digest; a receipt whose bundle changed after approval fails that check
 * rather than inheriting the approval.
 *
 * ## Why a rejection is also recorded
 *
 * §3.4 and §6A.1.5: refusal moves the operation to `cancelled` — worktree
 * destroyed, version burned, nothing published, `master` untouched. That is a
 * decision with consequences, so it is recorded the same way an approval is.
 */

import {
  ReleaseApprovalSchema,
  ReleaseControlDiagnosticCode,
  canonicalSha256,
  type ReleaseApproval,
  type ReleaseApprovalSubject,
  type ReleaseReceipt,
} from '@kb-labs/release-manager-contracts';

import { ReleaseReceiptError, transitionReceipt, type ReceiptStore } from './receipt.js';

export function buildApproval(input: {
  receiptId: string;
  decision: 'approved' | 'rejected';
  subject: ReleaseApprovalSubject;
  actor: string;
  at: string;
  comment?: string;
  approvalId?: string;
}): ReleaseApproval {
  const subjectSha256 = canonicalSha256(input.subject);
  return ReleaseApprovalSchema.parse({
    schema: 'kb.release-approval/1',
    approvalId: input.approvalId ?? `${input.receiptId}-${subjectSha256.slice(0, 12)}`,
    receiptId: input.receiptId,
    decision: input.decision,
    subject: input.subject,
    subjectSha256,
    actor: input.actor,
    at: input.at,
    ...(input.comment ? { comment: input.comment } : {}),
    signature: null,
  });
}

/**
 * Re-derives the subject digest and checks it against the receipt's own facts.
 *
 * Both halves are needed. Re-deriving catches a hand-edited `subjectSha256`;
 * comparing against the receipt catches the more interesting case — an approval
 * that is internally consistent but covers a *different bundle* than the receipt
 * now carries, which is what a replayed or misrouted approval looks like.
 */
export function assertApprovalCoversReceipt(approval: ReleaseApproval, receipt: ReleaseReceipt): void {
  const derived = canonicalSha256(approval.subject);
  if (derived !== approval.subjectSha256) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ApprovalSubjectMismatch,
      `approval ${approval.approvalId} carries subjectSha256 ${approval.subjectSha256} but its subject digests to ${derived}`,
    );
  }
  if (approval.receiptId !== receipt.receiptId) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ApprovalSubjectMismatch,
      `approval ${approval.approvalId} belongs to receipt ${approval.receiptId}, not ${receipt.receiptId}`,
    );
  }
  if (approval.subject.operation === 'candidate' && approval.subject.bundleSha256 !== receipt.bundleSha256) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ApprovalSubjectMismatch,
      `approval ${approval.approvalId} signed bundle ${approval.subject.bundleSha256}, but receipt ${receipt.receiptId} carries ${String(receipt.bundleSha256)}`,
    );
  }
}

/**
 * Applies an approval decision to a receipt.
 *
 * The approval document itself is attached as evidence (digest and all) in the
 * same append as the transition, so "who signed what" and "the state moved" are
 * never separately readable.
 */
export async function applyApproval(
  store: ReceiptStore,
  approval: ReleaseApproval,
  receipt: ReleaseReceipt,
): Promise<ReleaseReceipt> {
  assertApprovalCoversReceipt(approval, receipt);

  const to = approval.decision === 'rejected'
    ? 'cancelled'
    : approval.subject.operation === 'candidate' ? 'approved' : 'promotion-approved';

  return transitionReceipt(store, receipt.receiptId, to, {
    actor: approval.actor,
    at: approval.at,
    reason: approval.comment ?? `approval ${approval.approvalId} (${approval.decision})`,
    evidence: {
      id: approval.approvalId,
      kind: `release-approval:${approval.decision}`,
      sha256: approval.subjectSha256,
    },
  });
}

/** True once an approval transition for this operation is on the receipt. */
export function approvalRecorded(receipt: ReleaseReceipt): boolean {
  return receipt.transitions.some(
    transition => transition.to === 'approved' || transition.to === 'promotion-approved',
  );
}
