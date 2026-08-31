/**
 * The narrow interfaces through which the Workflow reaches everything it does
 * not own — CI, the public launcher, the channel-pointer endpoint and the
 * monitor that feeds the observation window.
 *
 * ## The ownership constraint these interfaces encode
 *
 * Execution plan §3.2 and cutover §6A.1.1: **CI may only deliver and verify a
 * supplied bundle and produce evidence.** It is not a writer of operational
 * state. That is not enforced here by a permission check — it is enforced by
 * shape. Every adapter takes a `ReleaseDeliveryRequest`-shaped input and returns
 * `DeliveryEvidence`-shaped output, and none of them is handed a `ReceiptStore`,
 * a `ReleaseLedgerStore` or a `LeaseStore`. A CI-side implementation therefore
 * *cannot* write a receipt: there is nothing in its arguments to write to.
 *
 * PR 6 supplies the real, `workflow_dispatch`-calling implementations. They plug
 * in without touching the state machine, because the state machine only ever
 * sees these four types.
 *
 * ## Why the failure split lives in the adapter's error type
 *
 * Execution plan PR 5 item 7 requires an npm timeout and a broken artifact to
 * end in different receipt states. Only the adapter knows which it saw, so the
 * distinction is carried in the error it throws — `retryable: true` means the
 * candidate is not disproven and its version must survive. A generic `Error`
 * from an adapter is treated as *non*-retryable, because the safe default when
 * we do not know whether the bytes are good is to stop burning attempts on them.
 */

import {
  DeliveryEvidenceSchema,
  ReleaseControlDiagnosticCode,
  ReleaseDeliveryRequestSchema,
  type DeliveryEvidence,
  type ReleaseDeliveryRequest,
  type ReleaseObservationSignal,
} from '@kb-labs/release-manager-contracts';

/**
 * Failure raised by any adapter.
 *
 * `retryable` is the whole reason this class exists rather than a bare `Error`.
 */
export class ReleaseAdapterError extends Error {
  readonly code: ReleaseControlDiagnosticCode;
  readonly retryable: boolean;

  constructor(message: string, options: { retryable: boolean; code?: ReleaseControlDiagnosticCode }) {
    super(message);
    this.name = 'ReleaseAdapterError';
    this.retryable = options.retryable;
    this.code = options.code
      ?? (options.retryable
        ? ReleaseControlDiagnosticCode.DeliveryTransient
        : ReleaseControlDiagnosticCode.DeliveryRejected);
  }
}

/** A transient infrastructure failure: retry the same bytes, keep the version. */
export function transientFailure(message: string): ReleaseAdapterError {
  return new ReleaseAdapterError(message, { retryable: true });
}

/** An artifact/functional failure: the candidate is wrong, and its version burns. */
export function rejectingFailure(message: string): ReleaseAdapterError {
  return new ReleaseAdapterError(message, { retryable: false });
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ReleaseAdapterError && error.retryable;
}

/**
 * CI: publish the exact supplied bundle as immutable artifacts.
 *
 * Changes no channel pointer — that is the `artifact-delivery-requested →
 * artifacts-published` precondition in §6A.1.5, and the reason publishing and
 * activation are two adapters rather than one call.
 */
export interface DeliveryAdapter {
  publishArtifacts(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence>;
}

/**
 * The public launcher smoke over an immutable, exact-version descriptor.
 *
 * Exact-version on purpose: smoking a channel would test whatever the channel
 * currently points at, which is precisely the thing that has not moved yet.
 */
export interface SmokeAdapter {
  smokeExactVersion(input: {
    receiptId: string;
    candidateId: string;
    releaseId: string;
    bundleSha256: string;
  }): Promise<DeliveryEvidence>;
}

/**
 * Channel pointer operations.
 *
 * `stage` is Phase B's non-public staging; `commit` is the single authoritative
 * CAS of §3C Phase C; `moveAlias` is the derived, best-effort npm dist-tag whose
 * failure is evidence and nothing more; `readPointer` backs both the Phase A
 * precondition re-check and the post-commit public probe.
 */
export interface ActivationAdapter {
  readPointer(channel: string): Promise<{ pointerSha256: string | null; releaseId: string | null }>;
  stageChannel(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence>;
  commitChannel(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence>;
  moveAlias(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    package: string;
    tag: string;
    version: string;
  }): Promise<DeliveryEvidence>;
  probePublic(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    channel: string;
    expectedReleaseId: string;
  }): Promise<DeliveryEvidence>;
}

/**
 * Observation-window signals (cutover §3C Phase D).
 *
 * A source, not a timer: the Workflow evaluates the plan's sealed thresholds
 * against whatever samples exist. Tests inject a list; a real monitor would
 * stream the same shape.
 */
export interface ObservationSource {
  collect(input: { receiptId: string; releaseId: string }): Promise<readonly ReleaseObservationSignal[]>;
}

/** Validates that evidence answers the request it is evidence *for*. */
export function assertEvidenceMatches(
  request: Pick<ReleaseDeliveryRequest, 'receiptId' | 'candidateId' | 'expectedBundleSha256' | 'operation'>,
  evidence: DeliveryEvidence,
): void {
  const parsed = DeliveryEvidenceSchema.parse(evidence);
  const mismatches: string[] = [];
  if (parsed.receiptId !== request.receiptId) { mismatches.push(`receiptId ${parsed.receiptId} ≠ ${request.receiptId}`); }
  if (parsed.candidateId !== request.candidateId) { mismatches.push(`candidateId ${parsed.candidateId} ≠ ${request.candidateId}`); }
  if (parsed.bundleSha256 !== request.expectedBundleSha256) {
    mismatches.push(`bundleSha256 ${parsed.bundleSha256} ≠ ${request.expectedBundleSha256}`);
  }
  if (parsed.operation !== request.operation) { mismatches.push(`operation ${parsed.operation} ≠ ${request.operation}`); }
  if (mismatches.length > 0) {
    // Non-retryable: evidence for a different bundle is not a flaky call, it is
    // a sign that something in the delivery plane is confused about identity.
    throw new ReleaseAdapterError(
      `delivery evidence does not match the request it answers (${mismatches.join('; ')})`,
      { retryable: false, code: ReleaseControlDiagnosticCode.EvidenceMismatch },
    );
  }
}

export function buildDeliveryRequest(input: {
  receiptId: string;
  candidateId: string;
  bundleUri: string;
  bundleSha256: string;
  stepId: string;
  operation: ReleaseDeliveryRequest['operation'];
  targetChannel?: ReleaseDeliveryRequest['targetChannel'];
  expectedPreviousPointerSha256?: string | null;
  pointerPlanSha256?: string;
}): ReleaseDeliveryRequest {
  return ReleaseDeliveryRequestSchema.parse({
    schema: 'kb.release-delivery-request/1',
    receiptId: input.receiptId,
    candidateId: input.candidateId,
    bundle: { uri: input.bundleUri, sha256: input.bundleSha256 },
    expectedBundleSha256: input.bundleSha256,
    stepId: input.stepId,
    operation: input.operation,
    ...(input.targetChannel ? { targetChannel: input.targetChannel } : {}),
    ...(input.expectedPreviousPointerSha256 !== undefined
      ? { expectedPreviousPointerSha256: input.expectedPreviousPointerSha256 }
      : {}),
    ...(input.pointerPlanSha256 ? { pointerPlanSha256: input.pointerPlanSha256 } : {}),
  });
}
