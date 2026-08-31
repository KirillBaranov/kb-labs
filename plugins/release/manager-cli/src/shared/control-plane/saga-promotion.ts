/**
 * The stable promotion saga (cutover §3C, §6A.4 steps 6–10, execution PR 5
 * item 4).
 *
 * ## What makes this different from the candidate branch
 *
 * It mutates no repository and builds no bytes. A stable promotion moves a
 * pointer onto artifacts that already exist — which is only sound because the
 * version ledger guarantees a version identifies one set of bytes forever. So
 * there is no `stage`, no `package`, no `commit` here, and no pipeline at all.
 *
 * ## Why one commit point
 *
 * Decision S0.3b (cutover §3C): direct npm installation of stable is not
 * supported, so npm dist-tags stopped being a resolution surface and became
 * derived, human-convenience aliases. That collapses what would otherwise be an
 * impossible distributed transaction across N packages into exactly one
 * transactional operation — the stable `ReleaseChannelPointer` CAS — plus a set
 * of best-effort alias moves whose failure is recorded as degraded state and
 * *never* triggers compensation or blocks the promotion. `moveAliasesBestEffort`
 * is written to swallow failures for exactly this reason, and its
 * try/catch is load-bearing rather than defensive.
 *
 * ## Why the journal precedes the first mutation
 *
 * §3C Phase A step 6. Between the first alias move and the pointer CAS there is
 * no transaction; if the process dies in that window, the only way to know what
 * to undo is a record written before the window opened.
 *
 * ## Compensation order
 *
 * §3C: pointer back **first**, because that is what new Launcher installs
 * resolve through; only then is alias state considered, and only as evidence. A
 * compensation that cannot restore the pointer moves the receipt to
 * `rollback-needs-attention`, which blocks every subsequent stable operation
 * until a human reconciles it — enforced by `assertStablePromotionAllowed`
 * before any new promotion starts, not by convention.
 */

import {
  ReleaseControlDiagnosticCode,
  StablePromotionJournalSchema,
  StablePromotionPlanSchema,
  TERMINAL_RECEIPT_STATES,
  canonicalSha256,
  type ReleaseObservationSignal,
  type ReleaseReceipt,
  type ReleaseReceiptState,
  type StablePromotionJournal,
  type StablePromotionPlan,
} from '@kb-labs/release-manager-contracts';

import {
  ReleaseAdapterError,
  assertEvidenceMatches,
  buildDeliveryRequest,
  isRetryable,
  type ActivationAdapter,
  type ObservationSource,
} from './adapters.js';
import {
  assertStablePromotionAllowed,
  buildLease,
  STABLE_PROMOTION_LEASE_KEY,
  type LeaseStore,
} from './lease.js';
import {
  authoritativeOperation,
  setOperationStatus,
  type JournalStore,
} from './journal.js';
import {
  ReleaseReceiptError,
  receiptNow,
  recordReceiptEvidence,
  requireReceipt,
  transitionReceipt,
  type ReceiptStore,
} from './receipt.js';

export const STABLE_CHANNEL = 'stable';

export interface PromotionSagaContext {
  receiptStore: ReceiptStore;
  leaseStore: LeaseStore;
  journalStore: JournalStore;
  activation: ActivationAdapter;
  observation: ObservationSource;
  actor: string;
  /** Absent starts a new promotion; present resumes one. */
  receiptId?: string;
  /** Required when starting: the canary receipt being promoted. */
  candidateReceiptId?: string;
  plan?: StablePromotionPlan;
  bundleUriFor?: (candidateId: string) => string;
  leaseTtlSeconds?: number;
  retryBudget?: number;
  now?: () => string;
}

export interface PromotionSagaResult {
  receipt: ReleaseReceipt;
  state: ReleaseReceiptState;
  awaitingApproval: boolean;
  plan: StablePromotionPlan | null;
  journal: StablePromotionJournal | null;
  /** Alias moves that did not land — degraded, never blocking (§3C Phase C). */
  degradedAliases: readonly string[];
}

function defaultBundleUri(candidateId: string): string {
  return `https://artifacts.kb-labs.dev/release/candidates/${candidateId}/bundle.tar`;
}

export function stablePromotionPlanSha256(plan: StablePromotionPlan): string {
  // Digest the plan without its signature slot: a signature is *about* the
  // digest, so including it would make the digest depend on itself.
  const { signature: _signature, ...rest } = plan;
  return canonicalSha256(rest);
}

/**
 * Builds and seals the plan the single promotion approval will sign.
 *
 * The previous pointer snapshot is captured here, not at commit time: it is
 * simultaneously the CAS precondition and the compensation target, and reading
 * it later would mean approving one world and compensating into another.
 */
export function buildStablePromotionPlan(input: {
  promotionId: string;
  candidate: { receiptId: string; releaseId: string; bundleSha256: string; indexSha256: string };
  previous: { stablePointerSha256: string | null; releaseId: string | null; npmTags?: StablePromotionPlan['previous']['npmTags'] };
  next: { stablePointerSha256: string; releaseId: string; npmTags?: StablePromotionPlan['next']['npmTags'] };
  observation: StablePromotionPlan['observation'];
  leaseKey?: string;
}): StablePromotionPlan {
  return StablePromotionPlanSchema.parse({
    schema: 'kb.stable-promotion/1',
    promotionId: input.promotionId,
    candidate: {
      receiptId: input.candidate.receiptId,
      releaseId: input.candidate.releaseId,
      bundleSha256: input.candidate.bundleSha256,
      indexSha256: input.candidate.indexSha256,
    },
    previous: {
      stablePointerSha256: input.previous.stablePointerSha256,
      releaseId: input.previous.releaseId,
      npmTags: input.previous.npmTags ?? [],
    },
    next: {
      stablePointerSha256: input.next.stablePointerSha256,
      releaseId: input.next.releaseId,
      npmTags: input.next.npmTags ?? [],
    },
    leaseKey: input.leaseKey ?? STABLE_PROMOTION_LEASE_KEY,
    observation: input.observation,
    signature: null,
  });
}

/**
 * Derives the full compensation plan from the sealed promotion plan.
 *
 * Derived rather than authored so the journal cannot describe operations the
 * approval did not cover: everything here comes from `plan.next`/`plan.previous`,
 * which are inside the digest the operator signed.
 */
export function buildPromotionJournal(input: {
  plan: StablePromotionPlan;
  receiptId: string;
  createdAt: string;
}): StablePromotionJournal {
  const { plan } = input;
  const previousByPackage = new Map(plan.previous.npmTags.map(tag => [`${tag.package}@${tag.tag}`, tag.version]));
  return StablePromotionJournalSchema.parse({
    schema: 'kb.stable-promotion-journal/1',
    promotionId: plan.promotionId,
    receiptId: input.receiptId,
    planSha256: stablePromotionPlanSha256(plan),
    createdAt: input.createdAt,
    operations: [
      ...plan.next.npmTags.map(tag => ({
        id: `alias:${tag.package}@${tag.tag}`,
        kind: 'npm-alias' as const,
        authoritative: false,
        target: `${tag.package}@${tag.tag}`,
        from: previousByPackage.get(`${tag.package}@${tag.tag}`) ?? null,
        to: tag.version,
        status: 'pending' as const,
      })),
      {
        id: 'pointer:stable',
        kind: 'pointer-cas' as const,
        // The one operation whose failure means the promotion failed, and whose
        // restoration is the whole of compensation.
        authoritative: true,
        target: STABLE_CHANNEL,
        from: plan.previous.stablePointerSha256,
        to: plan.next.stablePointerSha256,
        status: 'pending' as const,
      },
    ],
  });
}

async function attempt<T>(
  ctx: PromotionSagaContext,
  receipt: ReleaseReceipt,
  step: string,
  call: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  const budget = ctx.retryBudget ?? 3;
  let message = '';
  for (let index = 1; index <= budget; index += 1) {
    try {
      return { ok: true, value: await call() };
    } catch (error) {
      if (!(error instanceof ReleaseAdapterError)) {
        // A fault rather than a delivery outcome. Compensating on a fault we
        // cannot interpret would mutate stable on a guess; the journal and the
        // receipt already describe where we stopped, so a restart resumes here.
        throw error;
      }
      message = (error as Error).message;
      await recordReceiptEvidence(ctx.receiptStore, receipt.receiptId, {
        id: `${step}:attempt-${index}`,
        kind: 'stable-attempt-failed',
      }, { actor: ctx.actor, ...(ctx.now ? { at: ctx.now() } : {}) });
      // A non-retryable stable failure stops immediately: unlike the candidate
      // branch there is nothing to burn, and every extra attempt is one more
      // mutation against a world we already know is not as expected.
      if (!isRetryable(error)) { break; }
    }
  }
  return { ok: false, message };
}

/**
 * Phase C's derived surface.
 *
 * Every failure here is swallowed on purpose: §3C states that a failed alias
 * move "не запускает compensation и не блокирует stable". Letting one propagate
 * would convert a cosmetic npm inconvenience into a stable rollback.
 */
async function moveAliasesBestEffort(
  ctx: PromotionSagaContext,
  receipt: ReleaseReceipt,
  plan: StablePromotionPlan,
  journal: StablePromotionJournal,
): Promise<{ journal: StablePromotionJournal; degraded: string[] }> {
  let current = journal;
  const degraded: string[] = [];
  for (const tag of plan.next.npmTags) {
    const id = `alias:${tag.package}@${tag.tag}`;
    try {
      const evidence = await ctx.activation.moveAlias({
        receiptId: receipt.receiptId,
        candidateId: plan.candidate.releaseId,
        bundleSha256: plan.candidate.bundleSha256,
        package: tag.package,
        tag: tag.tag,
        version: tag.version,
      });
      const applied = evidence.result === 'succeeded';
      current = setOperationStatus(current, id, applied ? 'applied' : 'failed');
      if (!applied) { degraded.push(id); }
    } catch {
      current = setOperationStatus(current, id, 'failed');
      degraded.push(id);
    }
    await ctx.journalStore.write(current);
  }
  return { journal: current, degraded };
}

/**
 * Phase D's policy check.
 *
 * Not a timer and not a monitor. §3C is explicit that "неопределённый monitoring
 * signal не может самостоятельно откатить stable": only a signal naming one of
 * the plan's sealed triggers counts, and the minimum sample size must be met
 * before a clean window may close.
 */
export function evaluateObservationWindow(
  plan: StablePromotionPlan,
  signals: readonly ReleaseObservationSignal[],
): { outcome: 'passed' | 'rollback' | 'insufficient'; trigger: string | null } {
  const triggered = signals.find(signal =>
    signal.severity === 'critical'
    && signal.trigger !== null
    && plan.observation.triggers.includes(signal.trigger));
  if (triggered) { return { outcome: 'rollback', trigger: triggered.trigger }; }
  if (signals.length < plan.observation.minimumSamples) {
    return { outcome: 'insufficient', trigger: null };
  }
  return { outcome: 'passed', trigger: null };
}

async function requestRollback(
  ctx: PromotionSagaContext,
  receipt: ReleaseReceipt,
  reason: string,
): Promise<ReleaseReceipt> {
  return transitionReceipt(ctx.receiptStore, receipt.receiptId, 'rollback-requested', {
    actor: ctx.actor,
    reason,
    ...(ctx.now ? { at: ctx.now() } : {}),
  });
}

export async function advanceStablePromotion(ctx: PromotionSagaContext): Promise<PromotionSagaResult> {
  const now = ctx.now ?? receiptNow;
  let degradedAliases: string[] = [];

  let receipt: ReleaseReceipt;
  if (ctx.receiptId) {
    receipt = await requireReceipt(ctx.receiptStore, ctx.receiptId);
  } else {
    if (!ctx.plan || !ctx.candidateReceiptId) {
      throw new ReleaseReceiptError(
        ReleaseControlDiagnosticCode.ApprovalMissing,
        'starting a stable promotion needs both the selected canary receipt and a sealed StablePromotionPlan',
      );
    }
    // The §3C block on new stable work runs before anything is written: an
    // unreconciled rollback must stop the operation at its very first step.
    await assertStablePromotionAllowed(ctx.receiptStore);
    const at = now();
    receipt = await ctx.receiptStore.create({
      kind: 'created',
      at,
      actor: ctx.actor,
      receiptId: `rcpt-${ctx.plan.promotionId}`,
      releaseId: ctx.plan.next.releaseId,
      state: 'promotion-planned',
      binding: {
        candidateId: ctx.plan.candidate.releaseId,
        bundleSha256: ctx.plan.candidate.bundleSha256,
        indexSha256: ctx.plan.candidate.indexSha256,
      },
    });
    await recordReceiptEvidence(ctx.receiptStore, receipt.receiptId, {
      id: `promotion-plan:${ctx.plan.promotionId}`,
      kind: 'stable-promotion-plan',
      sha256: stablePromotionPlanSha256(ctx.plan),
    }, { actor: ctx.actor, at });
    receipt = await requireReceipt(ctx.receiptStore, receipt.receiptId);
  }

  const plan = ctx.plan ?? null;
  let journal = plan ? await ctx.journalStore.read(plan.promotionId) : null;

  const requirePlan = (): StablePromotionPlan => {
    if (!plan) {
      throw new ReleaseReceiptError(
        ReleaseControlDiagnosticCode.ApprovalMissing,
        `receipt ${receipt.receiptId} cannot be advanced without the sealed StablePromotionPlan it was approved against`,
      );
    }
    return plan;
  };

  for (;;) {
    if (TERMINAL_RECEIPT_STATES.includes(receipt.state)) {
      if (plan) {
        // The lease outlives the mutations and is released only when the
        // operation is genuinely over, in either direction.
        await ctx.leaseStore.release(plan.leaseKey, receipt.receiptId).catch(() => undefined);
      }
      return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };
    }

    switch (receipt.state) {
      case 'promotion-planned': {
        const sealed = requirePlan();
        // §6A.4 step 2: validate the selected canary's evidence and the pointer
        // compensation plan before an approval is requested over either.
        const candidate = await ctx.receiptStore.read(sealed.candidate.receiptId);
        if (!candidate || candidate.state !== 'completed' || candidate.bundleSha256 !== sealed.candidate.bundleSha256) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.EvidenceMismatch,
            `canary receipt ${sealed.candidate.receiptId} is not a completed candidate carrying bundle ${sealed.candidate.bundleSha256}`,
          );
        }
        const observed = await ctx.activation.readPointer(STABLE_CHANNEL);
        if (observed.pointerSha256 !== sealed.previous.stablePointerSha256) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.PointerPreconditionMismatch,
            `stable pointer is ${String(observed.pointerSha256)}, but the promotion plan was built against ${String(sealed.previous.stablePointerSha256)}`,
          );
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'promotion-checked', {
          actor: ctx.actor,
          at: now(),
          evidence: { id: `promotion-preconditions:${sealed.promotionId}`, kind: 'promotion-precheck' },
        });
        break;
      }

      case 'promotion-checked':
        // The single promotion approval signs the sealed plan digest (§3.4).
        return { receipt, state: receipt.state, awaitingApproval: true, plan, journal, degradedAliases };

      case 'promotion-approved': {
        // ── Phase A: exclusive preflight ──────────────────────────────────
        const sealed = requirePlan();
        await assertStablePromotionAllowed(ctx.receiptStore);
        await ctx.leaseStore.acquire(buildLease({
          key: sealed.leaseKey,
          holder: receipt.receiptId,
          actor: ctx.actor,
          at: now(),
          ttlSeconds: ctx.leaseTtlSeconds ?? 3600,
          reason: `stable promotion ${sealed.promotionId}`,
        }));
        // Re-check the CAS precondition *after* taking the lease: between
        // approval and now, another operation could have moved the pointer, and
        // approving one world while committing into another is the failure this
        // whole phase exists to prevent.
        const observed = await ctx.activation.readPointer(STABLE_CHANNEL);
        if (observed.pointerSha256 !== sealed.previous.stablePointerSha256) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.PointerPreconditionMismatch,
            `stable pointer moved to ${String(observed.pointerSha256)} after approval; the approved plan expected ${String(sealed.previous.stablePointerSha256)}`,
          );
        }
        // §3C Phase A step 6 — journal and full compensation plan persisted
        // before the first external mutation, which is the staging in Phase B.
        journal = await ctx.journalStore.write(buildPromotionJournal({
          plan: sealed,
          receiptId: receipt.receiptId,
          createdAt: now(),
        }));
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-preflight', {
          actor: ctx.actor,
          at: now(),
          evidence: { id: `promotion-journal:${sealed.promotionId}`, kind: 'compensation-journal', sha256: journal.planSha256 },
        });
        break;
      }

      case 'stable-preflight': {
        // ── Phase B: non-public staging ───────────────────────────────────
        const sealed = requirePlan();
        const request = buildDeliveryRequest({
          receiptId: receipt.receiptId,
          candidateId: sealed.candidate.releaseId,
          bundleUri: (ctx.bundleUriFor ?? defaultBundleUri)(sealed.candidate.releaseId),
          bundleSha256: sealed.candidate.bundleSha256,
          stepId: 'stage-stable',
          operation: 'stage-channel',
          targetChannel: 'stable',
        });
        const staged = await attempt(ctx, receipt, 'stage-stable', async () => {
          const evidence = await ctx.activation.stageChannel(request);
          assertEvidenceMatches(request, evidence);
          return evidence;
        });
        if (!staged.ok) {
          receipt = await requestRollback(ctx, receipt, `non-public staging failed: ${staged.message}`);
          break;
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-staged', {
          actor: ctx.actor,
          at: now(),
          evidence: { id: `stage-stable:${staged.value.ciRunId}`, kind: 'stage-evidence' },
        });
        break;
      }

      case 'stable-staged': {
        const sealed = requirePlan();
        // The table's precondition for entering `stable-committing`: a persisted
        // journal whose plan digest still matches the approved plan.
        journal = await ctx.journalStore.read(sealed.promotionId);
        if (!journal || journal.planSha256 !== stablePromotionPlanSha256(sealed)) {
          receipt = await requestRollback(
            ctx,
            receipt,
            'the persisted compensation journal does not match the approved promotion plan',
          );
          break;
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-committing', {
          actor: ctx.actor,
          at: now(),
        });
        break;
      }

      case 'stable-committing': {
        // ── Phase C: guarded commit ───────────────────────────────────────
        const sealed = requirePlan();
        journal = journal ?? await ctx.journalStore.read(sealed.promotionId);
        if (!journal) {
          receipt = await requestRollback(ctx, receipt, 'the compensation journal disappeared before commit');
          break;
        }
        // §6A.4 resume rule for the stable branch: reconcile the journal with
        // the *remote* pointer before mutating anything. A crash between the CAS
        // landing and its acknowledgement leaves a journal saying `pending` and
        // a world that already moved; replaying the CAS blindly would fail its
        // own precondition and be misread as a failed promotion.
        const observed = await ctx.activation.readPointer(STABLE_CHANNEL);
        if (observed.pointerSha256 === sealed.next.stablePointerSha256) {
          journal = await ctx.journalStore.write(setOperationStatus(journal, 'pointer:stable', 'applied'));
          receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-active', {
            actor: ctx.actor,
            at: now(),
            reason: 'the pointer CAS had already landed before the crash; resume observed it rather than replaying it',
          });
          break;
        }
        if (observed.pointerSha256 !== sealed.previous.stablePointerSha256) {
          // Drift we cannot explain. §6A.4 is explicit that this must not
          // "продолжать commit вслепую".
          receipt = await requestRollback(ctx, receipt, `unknown stable pointer drift: found ${String(observed.pointerSha256)}`);
          receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'rollback-needs-attention', {
            actor: ctx.actor,
            at: now(),
            reason: 'the stable pointer is neither the approved previous nor the approved next value; a human must reconcile it',
          });
          return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };
        }

        const aliasResult = await moveAliasesBestEffort(ctx, receipt, sealed, journal);
        journal = aliasResult.journal;
        degradedAliases = aliasResult.degraded;
        if (degradedAliases.length > 0) {
          await recordReceiptEvidence(ctx.receiptStore, receipt.receiptId, {
            id: `degraded-aliases:${sealed.promotionId}`,
            kind: 'degraded-alias-state',
          }, { actor: ctx.actor, at: now() });
        }

        // The one authoritative operation, performed last (§6A.1.5: "stable
        // pointer CAS completed last").
        const request = buildDeliveryRequest({
          receiptId: receipt.receiptId,
          candidateId: sealed.candidate.releaseId,
          bundleUri: (ctx.bundleUriFor ?? defaultBundleUri)(sealed.candidate.releaseId),
          bundleSha256: sealed.candidate.bundleSha256,
          stepId: 'commit-stable-pointer',
          operation: 'commit-channel',
          targetChannel: 'stable',
          expectedPreviousPointerSha256: sealed.previous.stablePointerSha256,
          pointerPlanSha256: sealed.next.stablePointerSha256,
        });
        const committed = await attempt(ctx, receipt, 'commit-stable-pointer', async () => {
          const evidence = await ctx.activation.commitChannel(request);
          assertEvidenceMatches(request, evidence);
          return evidence;
        });
        if (!committed.ok) {
          journal = await ctx.journalStore.write(setOperationStatus(journal, 'pointer:stable', 'failed'));
          receipt = await requestRollback(ctx, receipt, `stable pointer CAS failed: ${committed.message}`);
          break;
        }
        journal = await ctx.journalStore.write(setOperationStatus(journal, 'pointer:stable', 'applied'));
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-active', {
          actor: ctx.actor,
          at: now(),
          evidence: { id: `commit-stable-pointer:${committed.value.ciRunId}`, kind: 'pointer-evidence' },
        });
        break;
      }

      case 'stable-active': {
        const sealed = requirePlan();
        const probed = await attempt(ctx, receipt, 'stable-public-probe', () =>
          ctx.activation.probePublic({
            receiptId: receipt.receiptId,
            candidateId: sealed.candidate.releaseId,
            bundleSha256: sealed.candidate.bundleSha256,
            channel: STABLE_CHANNEL,
            expectedReleaseId: sealed.next.releaseId,
          }));
        if (!probed.ok) {
          // §3C: a failed probe *after* the pointer commit is exactly the case
          // compensation exists for, and it is pre-authorized by the same
          // approval — no second sign-off.
          receipt = await requestRollback(ctx, receipt, `public stable probe failed after pointer commit: ${probed.message}`);
          break;
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'stable-observing', {
          actor: ctx.actor,
          at: now(),
          evidence: { id: `stable-public-probe:${probed.value.ciRunId}`, kind: 'probe-evidence' },
        });
        break;
      }

      case 'stable-observing': {
        // ── Phase D: observation window ───────────────────────────────────
        const sealed = requirePlan();
        const signals = await ctx.observation.collect({
          receiptId: receipt.receiptId,
          releaseId: sealed.next.releaseId,
        });
        const verdict = evaluateObservationWindow(sealed, signals);
        if (verdict.outcome === 'rollback') {
          receipt = await requestRollback(ctx, receipt, `observation trigger fired: ${String(verdict.trigger)}`);
          break;
        }
        if (verdict.outcome === 'insufficient') {
          // Not a failure: the window simply has not produced enough evidence
          // to close. The caller polls again rather than the saga blocking.
          return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };
        }
        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'completed', {
          actor: ctx.actor,
          at: now(),
          reason: 'observation window closed with no sealed trigger',
        });
        break;
      }

      case 'rollback-requested': {
        const sealed = requirePlan();
        journal = journal ?? await ctx.journalStore.read(sealed.promotionId);
        const pointerOperation = journal ? authoritativeOperation(journal) : undefined;

        // §3C compensation order step 2: the pointer goes back FIRST. Nothing
        // about the derived aliases is allowed to precede or block it.
        if (pointerOperation && pointerOperation.status === 'applied') {
          const request = buildDeliveryRequest({
            receiptId: receipt.receiptId,
            candidateId: sealed.candidate.releaseId,
            bundleUri: (ctx.bundleUriFor ?? defaultBundleUri)(sealed.candidate.releaseId),
            bundleSha256: sealed.candidate.bundleSha256,
            stepId: 'compensate-stable-pointer',
            operation: 'compensate-channel',
            targetChannel: 'stable',
            expectedPreviousPointerSha256: sealed.next.stablePointerSha256,
            ...(sealed.previous.stablePointerSha256
              ? { pointerPlanSha256: sealed.previous.stablePointerSha256 }
              : {}),
          });
          const restored = await attempt(ctx, receipt, 'compensate-stable-pointer', async () => {
            const evidence = await ctx.activation.commitChannel(request);
            assertEvidenceMatches(request, evidence);
            return evidence;
          });
          if (!restored.ok) {
            journal = await ctx.journalStore.write(
              setOperationStatus(journal!, 'pointer:stable', 'compensation-failed'),
            );
            receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'rollback-needs-attention', {
              actor: ctx.actor,
              at: now(),
              reason: `bounded compensation could not restore the previous stable pointer: ${restored.message}. `
                + 'All subsequent stable promotions are blocked until this drift is reconciled.',
            });
            return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };
          }
          journal = await ctx.journalStore.write(setOperationStatus(journal!, 'pointer:stable', 'compensated'));
        }

        // §3C step 3: alias state after the pointer is observability only. It is
        // recorded and never allowed to fail the rollback.
        if (journal) {
          for (const operation of journal.operations) {
            if (operation.kind !== 'npm-alias' || operation.status !== 'applied' || operation.from === null) { continue; }
            try {
              await ctx.activation.moveAlias({
                receiptId: receipt.receiptId,
                candidateId: sealed.candidate.releaseId,
                bundleSha256: sealed.candidate.bundleSha256,
                package: operation.target.split('@').slice(0, -1).join('@'),
                tag: operation.target.split('@').slice(-1)[0]!,
                version: operation.from,
              });
              journal = setOperationStatus(journal, operation.id, 'compensated');
            } catch {
              journal = setOperationStatus(journal, operation.id, 'compensation-failed');
              degradedAliases = [...degradedAliases, operation.id];
            }
          }
          journal = await ctx.journalStore.write(journal);
        }

        receipt = await transitionReceipt(ctx.receiptStore, receipt.receiptId, 'rolled-back', {
          actor: ctx.actor,
          at: now(),
          reason: 'previous stable pointer restored; the promoted release remains immutable and reachable by exact identity',
        });
        break;
      }

      case 'rollback-needs-attention':
        // Deliberately not self-healing: §3C says this state blocks every
        // subsequent stable operation until reconciliation. Automatic bounded
        // retry of the sealed compensation is available through
        // `retryStableCompensation`, which is an explicit act.
        return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };

      default:
        return { receipt, state: receipt.state, awaitingApproval: false, plan, journal, degradedAliases };
    }
  }
}

/**
 * Re-arms the sealed compensation operations after a failed rollback.
 *
 * Needs no new approval: §3C states that compensation of the current promotion
 * is already covered by the same approval. It is nevertheless an explicit call
 * rather than something the driver does on its own, because a rollback that
 * failed once will usually fail again until a human changed something.
 */
export async function retryStableCompensation(
  ctx: PromotionSagaContext,
  receiptId: string,
  reason: string,
): Promise<ReleaseReceipt> {
  const receipt = await requireReceipt(ctx.receiptStore, receiptId);
  if (receipt.state !== 'rollback-needs-attention') {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.IllegalReceiptTransition,
      `receipt ${receiptId} is at ${receipt.state}, not rollback-needs-attention`,
    );
  }
  return transitionReceipt(ctx.receiptStore, receiptId, 'rollback-requested', {
    actor: ctx.actor,
    reason,
    ...(ctx.now ? { at: ctx.now() } : {}),
  });
}
