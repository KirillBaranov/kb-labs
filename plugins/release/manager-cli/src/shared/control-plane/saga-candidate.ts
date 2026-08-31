/**
 * The candidate branch of the release control plane (cutover §6A.4 steps 1–5,
 * execution PR 5 items 3, 5 and 7).
 *
 * ## Shape: a driver, not a script
 *
 * `advanceCandidateRelease` reads the receipt's current state and performs the
 * one step that state permits, repeatedly, until it reaches a terminal state or
 * a gate. It is not a top-to-bottom sequence, and that is the whole design: a
 * sequence has to be re-entered from the top after a crash, which is exactly how
 * a release ends up re-running `stage` on bytes that already exist. Here, resume
 * is not a special path — it is the ordinary path, started from a receipt that
 * is already partway through.
 *
 * The resume rules from §6A.4 therefore fall out structurally rather than being
 * enforced by scattered guards:
 *
 * - `plan`/`stage`/`package`/`seal` are the actions of states *before* `bundled`,
 *   so a receipt at `bundled` or later can never reach them. `assertNoRebuild`
 *   is a second, explicit check on top of that, because "structurally
 *   impossible" is a claim worth failing loudly if it ever stops being true.
 * - Nothing rebuilds after `approved` for the same reason.
 * - A replayed adapter call carries `{receiptId, candidateId, bundleSha256,
 *   target}` re-derived from the receipt, so it is unchanged by construction.
 *
 * ## The failure split (item 7)
 *
 * The single most consequential rule here: an npm timeout must not consume a
 * SemVer. So every adapter call is wrapped by `attemptDelivery`, which sends
 * retryable failures to a bounded retry and then to `needs-attention` — version
 * intact, same bundle, resumable without a second approval — and non-retryable
 * failures to `rejected`, where the version is burned in the PR 4 ledger.
 *
 * ## Where the approval sits
 *
 * The driver stops at `bundled` and returns `awaitingApproval`. It does not
 * accept an "approved" flag, and there is no parameter that would let a caller
 * skip the stop: the only way past `bundled` is an approval document recorded on
 * the receipt by `applyApproval`. That is execution plan §3.4's requirement
 * expressed as control flow.
 */

import {
  RECEIPT_STATES_WITH_SEALED_BYTES,
  ReleaseControlDiagnosticCode,
  TERMINAL_RECEIPT_STATES,
  type ReleaseReceipt,
  type ReleaseReceiptState,
} from '@kb-labs/release-manager-contracts';

import {
  ReleaseAdapterError,
  assertEvidenceMatches,
  buildDeliveryRequest,
  isRetryable,
  type ActivationAdapter,
  type DeliveryAdapter,
  type SmokeAdapter,
} from './adapters.js';
import { transitionLedgerEntry, type ReleaseLedgerStore } from './ledger.js';
import type { CandidatePipeline, PipelinePlanResult, ReleaseMap } from './pipeline.js';
import {
  ReleaseReceiptError,
  receiptNow,
  recordReceiptEvidence,
  requireReceipt,
  transitionReceipt,
  type ReceiptStore,
} from './receipt.js';

export interface CandidateSagaContext {
  receiptStore: ReceiptStore;
  /** PR 4's version ledger — needed only to burn a version on `rejected`/`cancelled`. */
  ledgerStore?: ReleaseLedgerStore;
  pipeline: CandidatePipeline;
  delivery: DeliveryAdapter;
  smoke: SmokeAdapter;
  activation: ActivationAdapter;
  flow: string;
  actor: string;
  /** Absent starts a new operation; present resumes an existing receipt. */
  receiptId?: string;
  /** Where the sealed bundle lives; a pure function of the candidate id. */
  bundleDirFor?: (candidateId: string) => string;
  /** Scoped read locator handed to CI. CI never receives a write credential. */
  bundleUriFor?: (candidateId: string) => string;
  /** Bounded automatic retry for transient adapter failures. */
  retryBudget?: number;
  now?: () => string;
}

export interface CandidateSagaResult {
  receipt: ReleaseReceipt;
  state: ReleaseReceiptState;
  /** True at `bundled`: the operation is waiting for its one human approval. */
  awaitingApproval: boolean;
  /** Present once the bundle is sealed; this is what the approval covers. */
  releaseMap: ReleaseMap | null;
}

/** Identity every post-`bundled` step needs, re-derived from the receipt alone. */
interface CandidateIdentity {
  receiptId: string;
  releaseId: string;
  candidateId: string;
  bundleSha256: string;
  bundleDir: string;
  bundleUri: string;
}

function defaultBundleDir(candidateId: string): string {
  return `.kb/release/candidates/${candidateId}/bundle`;
}

function defaultBundleUri(candidateId: string): string {
  return `https://artifacts.kb-labs.dev/release/candidates/${candidateId}/bundle.tar`;
}

function identityOf(receipt: ReleaseReceipt, ctx: CandidateSagaContext): CandidateIdentity {
  if (!receipt.candidateId || !receipt.bundleSha256) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ResumeIdentityMismatch,
      `receipt ${receipt.receiptId} reached ${receipt.state} without a bound candidateId/bundleSha256`,
    );
  }
  const bundleDirFor = ctx.bundleDirFor ?? defaultBundleDir;
  const bundleUriFor = ctx.bundleUriFor ?? defaultBundleUri;
  return {
    receiptId: receipt.receiptId,
    releaseId: receipt.releaseId,
    candidateId: receipt.candidateId,
    bundleSha256: receipt.bundleSha256,
    bundleDir: bundleDirFor(receipt.candidateId),
    bundleUri: bundleUriFor(receipt.candidateId),
  };
}

/**
 * Guards the "never rebuild" rule explicitly.
 *
 * Redundant with the driver's own structure, and kept anyway: this is the rule
 * whose violation silently republishes different bytes under an approved digest,
 * so it is worth one loud failure rather than one silent reliance.
 */
export function assertNoRebuild(receipt: ReleaseReceipt, step: string): void {
  if (RECEIPT_STATES_WITH_SEALED_BYTES.includes(receipt.state)) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ForbiddenRebuild,
      `receipt ${receipt.receiptId} is at ${receipt.state}: ${step} must never run again once the bundle is sealed`,
    );
  }
}

/** `releaseId` is `${flow}-${version}` (PR 4's `reserveVersion`). */
function versionOf(releaseId: string, flow: string): string | null {
  return releaseId.startsWith(`${flow}-`) ? releaseId.slice(flow.length + 1) : null;
}

/**
 * Burns the reserved version.
 *
 * Only ever called on the `rejected`/`cancelled` paths: a transient failure must
 * not reach here, which is precisely the distinction item 7 exists to make. A
 * ledger entry that has already moved on is left alone rather than forced —
 * burning twice is not more burned, and forcing would mask a real inconsistency.
 */
async function burnVersion(
  ctx: CandidateSagaContext,
  receipt: ReleaseReceipt,
  to: 'rejected' | 'cancelled',
  reason: string,
): Promise<void> {
  if (!ctx.ledgerStore) { return; }
  const version = versionOf(receipt.releaseId, ctx.flow);
  if (!version) { return; }
  try {
    await transitionLedgerEntry(ctx.ledgerStore, ctx.flow, version, to, {
      actor: ctx.actor,
      reason,
      ...(ctx.now ? { now: ctx.now } : {}),
    });
  } catch {
    // The receipt is the operational truth; a ledger entry that refuses the
    // transition is a reconciliation problem, not a reason to leave the receipt
    // in a live state describing a dead release.
  }
}

async function fail(
  ctx: CandidateSagaContext,
  receipt: ReleaseReceipt,
  to: 'rejected' | 'cancelled',
  reason: string,
): Promise<ReleaseReceipt> {
  await burnVersion(ctx, receipt, to, reason);
  if (receipt.candidateId) {
    // §3.4 consequence 1: the disposable worktree dies with the operation.
    try { await ctx.pipeline.discard({ candidateId: receipt.candidateId }); } catch { /* already gone */ }
  }
  return transitionReceipt(ctx.receiptStore, receipt.receiptId, to, {
    actor: ctx.actor,
    reason,
    ...(ctx.now ? { at: ctx.now() } : {}),
  });
}

/**
 * Runs one adapter call under the bounded-retry policy.
 *
 * Returns `null` when the retry budget is exhausted, having already moved the
 * receipt to `needs-attention`. The version is untouched on that path — that is
 * the point.
 */
async function attemptDelivery<T>(
  ctx: CandidateSagaContext,
  receipt: ReleaseReceipt,
  step: string,
  call: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; receipt: ReleaseReceipt }> {
  const budget = ctx.retryBudget ?? 3;
  let lastMessage = '';
  for (let attempt = 1; attempt <= budget; attempt += 1) {
    try {
      return { ok: true, value: await call() };
    } catch (error) {
      if (!(error instanceof ReleaseAdapterError)) {
        // Not a delivery outcome at all — a fault in the adapter or the process
        // itself. Classifying it would be a guess, and guessing "rejected" would
        // burn a version over a bug. Let it propagate: the receipt already
        // records the state this step was attempted from, so a restarted
        // process resumes exactly here.
        throw error;
      }
      if (!isRetryable(error)) {
        const reason = `${step} failed: ${(error as Error).message}`;
        return { ok: false, receipt: await fail(ctx, receipt, 'rejected', reason) };
      }
      lastMessage = (error as Error).message;
      // §6A.1.5: automatic retries write attempt evidence into the same receipt
      // and never create a new intent.
      await recordReceiptEvidence(ctx.receiptStore, receipt.receiptId, {
        id: `${step}:attempt-${attempt}`,
        kind: 'delivery-attempt-failed',
      }, { actor: ctx.actor, ...(ctx.now ? { at: ctx.now() } : {}) });
    }
  }
  const next = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'needs-attention', {
    actor: ctx.actor,
    reason: `${step} exhausted its retry budget (${budget}) with a transient failure: ${lastMessage}. `
      + 'The version is intact and the same bundle may be resumed without a new approval.',
    ...(ctx.now ? { at: ctx.now() } : {}),
  });
  return { ok: false, receipt: next };
}

/**
 * The state whose adapter call was left unacknowledged when the receipt parked
 * in `needs-attention`.
 *
 * Read back off the receipt rather than remembered in memory, because the whole
 * reason the receipt exists is that the process which parked it may be gone.
 */
function pendingStateBefore(receipt: ReleaseReceipt): ReleaseReceiptState | null {
  for (let index = receipt.transitions.length - 1; index >= 0; index -= 1) {
    const transition = receipt.transitions[index]!;
    if (transition.to === 'needs-attention') { return transition.from; }
  }
  return null;
}

export async function advanceCandidateRelease(ctx: CandidateSagaContext): Promise<CandidateSagaResult> {
  const now = ctx.now ?? receiptNow;
  let plan: PipelinePlanResult | null = null;
  let releaseMap: ReleaseMap | null = null;
  let sealResult: Awaited<ReturnType<CandidatePipeline['seal']>> | null = null;
  let checks: Awaited<ReturnType<CandidatePipeline['sourceChecks']>> | null = null;

  let receipt: ReleaseReceipt;
  if (ctx.receiptId) {
    receipt = await requireReceipt(ctx.receiptStore, ctx.receiptId);
    // A resumed pre-bundle receipt still needs the intent and frozen changelog
    // to finish staging — but must not re-run `plan`, which would allocate a
    // second version for one release. `rehydrate` reads back what `plan` wrote.
    if (receipt.candidateId && !RECEIPT_STATES_WITH_SEALED_BYTES.includes(receipt.state)) {
      plan = await ctx.pipeline.rehydrate(receipt.candidateId);
    }
  } else {
    // Step 1 of §6A.4: plan first, then persist its digest in a *new* receipt.
    // The receipt cannot exist earlier — its identity is the candidate's.
    plan = await ctx.pipeline.plan();
    const at = now();
    receipt = await ctx.receiptStore.create({
      kind: 'created',
      at,
      actor: ctx.actor,
      receiptId: `rcpt-${plan.candidateId}`,
      releaseId: plan.releaseId,
      state: 'planned',
      binding: { candidateId: plan.candidateId },
    });
    await recordReceiptEvidence(ctx.receiptStore, receipt.receiptId, {
      id: `intent:${plan.candidateId}`,
      kind: 'release-intent',
      sha256: plan.intentSha256,
    }, { actor: ctx.actor, at });
    receipt = await requireReceipt(ctx.receiptStore, receipt.receiptId);
  }

  for (;;) {
    if (TERMINAL_RECEIPT_STATES.includes(receipt.state)) {
      return { receipt, state: receipt.state, awaitingApproval: false, releaseMap };
    }

    const stateBefore = receipt.state;
    switch (receipt.state) {
      case 'planned': {
        assertNoRebuild(receipt, 'source checks');
        if (!plan) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.ResumeIdentityMismatch,
            `receipt ${receipt.receiptId} is at planned but this process has no plan result; `
            + 'a resumed planned receipt must be re-driven from the same process that planned it',
          );
        }
        checks = await ctx.pipeline.sourceChecks({ plan });
        if (!checks.ok) {
          // A failed source check is a statement about the code, not the
          // infrastructure: the candidate is wrong and its version burns.
          receipt = await fail(ctx, receipt, 'rejected', 'source checks did not pass');
          break;
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'source-checked', {
          actor: ctx.actor,
          at: now(),
          evidence: checks.evidence,
        });
        break;
      }

      case 'source-checked': {
        assertNoRebuild(receipt, 'stage');
        if (!plan) { throw resumeNeedsPlan(receipt); }
        const staged = await ctx.pipeline.stage({ plan });
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'staged', {
          actor: ctx.actor,
          at: now(),
          binding: { treeSha256: staged.treeSha256 },
        });
        break;
      }

      case 'staged': {
        assertNoRebuild(receipt, 'package/seal');
        if (!plan) { throw resumeNeedsPlan(receipt); }
        const packaged = await ctx.pipeline.package({ plan });
        sealResult = await ctx.pipeline.seal({ plan, bundleDir: packaged.bundleDir });
        const verification = await ctx.pipeline.verifyBundle({
          plan,
          bundleDir: sealResult.bundleDir,
          bundleSha256: sealResult.bundleSha256,
        });
        if (!verification.ok) {
          receipt = await fail(ctx, receipt, 'rejected', 'sealed bundle failed verification');
          break;
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'bundled', {
          actor: ctx.actor,
          at: now(),
          binding: { bundleSha256: sealResult.bundleSha256, indexSha256: sealResult.indexSha256 },
          evidence: verification.evidence,
        });
        break;
      }

      case 'bundled': {
        // §6A.4 step 4 / §3.4: the map is rendered over the sealed bundle and
        // only then is the single approval requested. Rendering it here rather
        // than at `staged` is what makes `bundleSha256` signable.
        if (plan && sealResult) {
          releaseMap = await ctx.pipeline.renderReleaseMap({
            plan,
            seal: sealResult,
            checks: checks?.report ?? null,
          });
        }
        return { receipt, state: receipt.state, awaitingApproval: true, releaseMap };
      }

      case 'approved': {
        const identity = identityOf(receipt, ctx);
        const committed = await ctx.pipeline.commit({
          candidateId: identity.candidateId,
          bundleDir: identity.bundleDir,
        });
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'committed', {
          actor: ctx.actor,
          at: now(),
          binding: { releaseCommit: committed.releaseCommit, treeSha256: committed.treeSha256 },
        });
        break;
      }

      case 'committed': {
        // The request is recorded *before* the call. A crash between the two
        // leaves a receipt saying "requested" with no evidence, which is the
        // resumable shape; the reverse would lose the fact that CI was asked.
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'artifact-delivery-requested', {
          actor: ctx.actor,
          at: now(),
        });
        break;
      }

      case 'artifact-delivery-requested': {
        const identity = identityOf(receipt, ctx);
        const request = buildDeliveryRequest({
          receiptId: identity.receiptId,
          candidateId: identity.candidateId,
          bundleUri: identity.bundleUri,
          bundleSha256: identity.bundleSha256,
          stepId: 'publish-artifacts',
          operation: 'publish-artifacts',
        });
        const attempt = await attemptDelivery(ctx, receipt, 'publish-artifacts', async () => {
          const evidence = await ctx.delivery.publishArtifacts(request);
          assertEvidenceMatches(request, evidence);
          return evidence;
        });
        if (!attempt.ok) { receipt = attempt.receipt; break; }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'artifacts-published', {
          actor: ctx.actor,
          at: now(),
          evidence: {
            id: `publish-artifacts:${attempt.value.ciRunId}`,
            kind: 'delivery-evidence',
            sha256: attempt.value.bundleSha256,
          },
        });
        break;
      }

      case 'artifacts-published': {
        const identity = identityOf(receipt, ctx);
        const attempt = await attemptDelivery(ctx, receipt, 'public-smoke', () =>
          ctx.smoke.smokeExactVersion({
            receiptId: identity.receiptId,
            candidateId: identity.candidateId,
            releaseId: identity.releaseId,
            bundleSha256: identity.bundleSha256,
          }));
        if (!attempt.ok) { receipt = attempt.receipt; break; }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'candidate-smoke-passed', {
          actor: ctx.actor,
          at: now(),
          evidence: {
            id: `public-smoke:${attempt.value.ciRunId}`,
            kind: 'smoke-evidence',
            sha256: attempt.value.bundleSha256,
          },
        });
        break;
      }

      case 'candidate-smoke-passed': {
        // `experimental` has no executable branch in this cutover (§6A.4 step 5,
        // decision S0.3d), and `stable` is a separate promotion operation — so
        // canary is the only activation a candidate can request.
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'canary-activation-requested', {
          actor: ctx.actor,
          at: now(),
        });
        break;
      }

      case 'canary-activation-requested': {
        const identity = identityOf(receipt, ctx);
        const request = buildDeliveryRequest({
          receiptId: identity.receiptId,
          candidateId: identity.candidateId,
          bundleUri: identity.bundleUri,
          bundleSha256: identity.bundleSha256,
          stepId: 'activate-canary',
          operation: 'commit-channel',
          targetChannel: 'canary',
        });
        const attempt = await attemptDelivery(ctx, receipt, 'activate-canary', async () => {
          const evidence = await ctx.activation.commitChannel(request);
          assertEvidenceMatches(request, evidence);
          return evidence;
        });
        if (!attempt.ok) { receipt = attempt.receipt; break; }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'canary-active', {
          actor: ctx.actor,
          at: now(),
          evidence: {
            id: `activate-canary:${attempt.value.ciRunId}`,
            kind: 'channel-evidence',
            sha256: attempt.value.bundleSha256,
          },
        });
        break;
      }

      case 'canary-active': {
        const identity = identityOf(receipt, ctx);
        const attempt = await attemptDelivery(ctx, receipt, 'verify-canary-pointer', () =>
          ctx.activation.probePublic({
            receiptId: identity.receiptId,
            candidateId: identity.candidateId,
            bundleSha256: identity.bundleSha256,
            channel: 'canary',
            expectedReleaseId: identity.releaseId,
          }));
        if (!attempt.ok) { receipt = attempt.receipt; break; }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'completed', {
          actor: ctx.actor,
          at: now(),
          reason: 'public canary descriptor verified',
          evidence: {
            id: `verify-canary-pointer:${attempt.value.ciRunId}`,
            kind: 'pointer-evidence',
          },
        });
        break;
      }

      case 'needs-attention': {
        const pending = pendingStateBefore(receipt);
        if (!pending) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.ResumeIdentityMismatch,
            `receipt ${receipt.receiptId} is at needs-attention with no recorded pending state`,
          );
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, pending, {
          actor: ctx.actor,
          at: now(),
          reason: `resuming the unacknowledged ${pending} step with the same bundle and target`,
        });
        break;
      }

      default:
        // Promotion states belong to the stable saga; anything else is a state
        // the candidate branch has no action for and must not guess at.
        return { receipt, state: receipt.state, awaitingApproval: false, releaseMap };
    }

    // Parking is where this run stops. Resuming out of `needs-attention` inside
    // the same invocation would turn "bounded retry, then hand it to a human"
    // into an unbounded one, which is the failure mode the budget exists to
    // prevent. A resume is a *new* invocation over the same receipt — which is
    // why the loop above happily drives a receipt that was already parked.
    if (receipt.state === 'needs-attention' && stateBefore !== 'needs-attention') {
      return { receipt, state: receipt.state, awaitingApproval: false, releaseMap };
    }
  }
}

function resumeNeedsPlan(receipt: ReleaseReceipt): ReleaseReceiptError {
  return new ReleaseReceiptError(
    ReleaseControlDiagnosticCode.ResumeIdentityMismatch,
    `receipt ${receipt.receiptId} is at ${receipt.state}, which still needs the staged plan; `
    + 'a pre-bundle receipt can only be advanced by the process that planned it',
  );
}

/** Refusal at the approval gate: §3.4 and §6A.1.5 — cancel, burn, publish nothing. */
export async function cancelCandidateRelease(
  ctx: CandidateSagaContext,
  receiptId: string,
  reason: string,
): Promise<ReleaseReceipt> {
  const receipt = await requireReceipt(ctx.receiptStore, receiptId);
  return fail(ctx, receipt, 'cancelled', reason);
}
