/**
 * PR 5 DoD (execution plan): "тесты с фейковыми plugin/CI адаптерами покрывают
 * каждый переход, рестарт в каждом состоянии, дубликат/опоздавший/чужой
 * evidence, краш после каждой stable мутации, отказ probe после pointer commit,
 * отказ compensation и блокировку lease".
 *
 * The tests are organised by that list rather than by module, because each item
 * is a claim about the *whole* state machine and would be vacuous if asserted
 * against one class in isolation.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseControlDiagnosticCode,
  ReleaseReceiptStateSchema,
  ReleaseReceiptTransitions,
  canonicalSha256,
  isAllowedReceiptTransition,
  type ReleaseReceiptState,
} from '@kb-labs/release-manager-contracts';

import {
  FakeReleaseCrash,
  InMemoryReceiptStore,
  InMemoryLeaseStore,
  InMemoryJournalStore,
  FileReceiptStore,
  FileLeaseStore,
  InMemoryReleaseLedgerStore,
  SimulatedCandidatePipeline,
  advanceCandidateRelease,
  advanceStablePromotion,
  applyApproval,
  approvalRecorded,
  buildApproval,
  buildPromotionJournal,
  buildStablePromotionPlan,
  cancelCandidateRelease,
  createFakeAdapters,
  evaluateObservationWindow,
  foldReceiptEvents,
  reserveVersion,
  retryStableCompensation,
  stablePromotionPlanSha256,
  transitionReceipt,
  type CandidateSagaContext,
  type FakeAdapterSet,
  type PromotionSagaContext,
} from '../control-plane/index.js';

const ACTOR = 'kirill';
const AT = '2026-08-31T09:00:00Z';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-cp-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

function candidateContext(overrides: Partial<CandidateSagaContext> = {}): CandidateSagaContext & {
  adapters: FakeAdapterSet;
  pipeline: SimulatedCandidatePipeline;
} {
  const adapters = overrides.delivery ? null : createFakeAdapters();
  const set = adapters ?? createFakeAdapters();
  const pipeline = (overrides.pipeline as SimulatedCandidatePipeline) ?? new SimulatedCandidatePipeline();
  return {
    receiptStore: new InMemoryReceiptStore(),
    pipeline,
    delivery: set.delivery,
    smoke: set.smoke,
    activation: set.activation,
    flow: 'platform',
    actor: ACTOR,
    now: () => AT,
    ...overrides,
    adapters: set,
  } as CandidateSagaContext & { adapters: FakeAdapterSet; pipeline: SimulatedCandidatePipeline };
}

/** Drives a candidate to the approval gate, approves it, and finishes. */
async function runCandidateToCompletion(ctx: CandidateSagaContext) {
  const gate = await advanceCandidateRelease(ctx);
  expect(gate.awaitingApproval).toBe(true);
  const approval = buildApproval({
    receiptId: gate.receipt.receiptId,
    decision: 'approved',
    subject: {
      operation: 'candidate',
      intentSha256: canonicalSha256({ intent: gate.receipt.receiptId }),
      bundleSha256: gate.receipt.bundleSha256!,
      requestedTarget: 'canary',
    },
    actor: ACTOR,
    at: AT,
  });
  await applyApproval(ctx.receiptStore, approval, gate.receipt);
  return advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
}

// ── the transition table itself ───────────────────────────────────────────────

describe('receipt transition table', () => {
  it('permits exactly the pairs §6A.1.5 lists and rejects everything else', () => {
    const states = ReleaseReceiptStateSchema.options as readonly ReleaseReceiptState[];
    const allowed = new Set(ReleaseReceiptTransitions.map(([from, to]) => `${from}→${to}`));
    for (const from of states) {
      for (const to of states) {
        expect(isAllowedReceiptTransition(from, to)).toBe(allowed.has(`${from}→${to}`));
      }
    }
  });

  it('separates a burned-version rejection from a resumable infrastructure park', () => {
    // Item 7's whole point: an npm timeout and a broken artifact must not land
    // in the same state.
    expect(isAllowedReceiptTransition('artifact-delivery-requested', 'rejected')).toBe(true);
    expect(isAllowedReceiptTransition('artifact-delivery-requested', 'needs-attention')).toBe(true);
    expect(isAllowedReceiptTransition('needs-attention', 'artifact-delivery-requested')).toBe(true);
    // `needs-attention` may never jump forward past the step it parked on.
    expect(isAllowedReceiptTransition('needs-attention', 'canary-active')).toBe(false);
    expect(isAllowedReceiptTransition('needs-attention', 'completed')).toBe(false);
  });

  it('refuses to fold an illegal transition instead of coercing it', () => {
    expect(() => foldReceiptEvents([
      { kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' },
      { kind: 'transition', at: AT, actor: ACTOR, to: 'canary-active' },
    ])).toThrowError(/transition planned → canary-active is not in the release transition table/);
  });
});

// ── the receipt store ─────────────────────────────────────────────────────────

describe('append-only receipt store', () => {
  it('rejects an illegal transition without persisting it', async () => {
    const store = new InMemoryReceiptStore();
    await store.create({ kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' });
    await expect(transitionReceipt(store, 'r1', 'completed', { actor: ACTOR, at: AT })).rejects.toThrow();
    expect((await store.read('r1'))!.state).toBe('planned');
    expect(store.eventsFor('r1')).toHaveLength(1);
  });

  it('never rewrites a digest a previous event already bound', async () => {
    const store = new InMemoryReceiptStore();
    await store.create({ kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' });
    const first = 'a'.repeat(64);
    const second = 'b'.repeat(64);
    await store.append('r1', { kind: 'binding', at: AT, actor: ACTOR, binding: { bundleSha256: first } });
    await expect(store.append('r1', { kind: 'binding', at: AT, actor: ACTOR, binding: { bundleSha256: second } }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.ResumeIdentityMismatch });
  });

  it('is durable and re-readable from disk, and lists by state', async () => {
    const dir = tempDir();
    const store = new FileReceiptStore(dir);
    await store.create({ kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' });
    await transitionReceipt(store, 'r1', 'source-checked', { actor: ACTOR, at: AT });

    // A fresh store object over the same directory is what a resumed process is.
    const reopened = new FileReceiptStore(dir);
    expect((await reopened.read('r1'))!.state).toBe('source-checked');
    expect(await reopened.listByState('source-checked')).toHaveLength(1);
    expect(await reopened.listByState('completed')).toHaveLength(0);

    // Append-only on disk: the created event is still line one.
    const raw = readFileSync(join(dir, 'r1.jsonl'), 'utf8').trim().split('\n');
    expect(JSON.parse(raw[0]!).kind).toBe('created');
    expect(raw).toHaveLength(2);
  });

  it('serialises concurrent writers through the host-local lock', async () => {
    const store = new FileReceiptStore(tempDir());
    await store.create({ kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' });
    // Both runs try to advance the same receipt; the table allows only one.
    const results = await Promise.allSettled([
      transitionReceipt(store, 'r1', 'source-checked', { actor: 'run-a', at: AT }),
      transitionReceipt(store, 'r1', 'source-checked', { actor: 'run-b', at: AT }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await store.read('r1'))!.state).toBe('source-checked');
  });
});

// ── approval ──────────────────────────────────────────────────────────────────

describe('the single approval', () => {
  it('is an immutable receipt transition carrying actor and time', async () => {
    const ctx = candidateContext();
    const gate = await advanceCandidateRelease(ctx);
    expect(gate.state).toBe('bundled');
    expect(gate.releaseMap!.bundleSha256).toBe(gate.receipt.bundleSha256);

    const approval = buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: {
        operation: 'candidate',
        intentSha256: canonicalSha256({ i: 1 }),
        bundleSha256: gate.receipt.bundleSha256!,
        requestedTarget: 'canary',
      },
      actor: ACTOR,
      at: AT,
    });
    const after = await applyApproval(ctx.receiptStore, approval, gate.receipt);
    const transition = after.transitions.find(entry => entry.to === 'approved')!;
    expect(transition.actor).toBe(ACTOR);
    expect(transition.at).toBe(AT);
    expect(after.evidence.some(entry => entry.sha256 === approval.subjectSha256)).toBe(true);
    expect(approvalRecorded(after)).toBe(true);
  });

  it('refuses an approval that signed a different bundle', async () => {
    const ctx = candidateContext();
    const gate = await advanceCandidateRelease(ctx);
    const wrong = buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: {
        operation: 'candidate',
        intentSha256: canonicalSha256({ i: 1 }),
        bundleSha256: 'f'.repeat(64),
        requestedTarget: 'canary',
      },
      actor: ACTOR,
      at: AT,
    });
    await expect(applyApproval(ctx.receiptStore, wrong, gate.receipt))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.ApprovalSubjectMismatch });
  });

  it('cancels, destroys the worktree and burns the version when refused', async () => {
    const ledgerStore = new InMemoryReleaseLedgerStore();
    await reserveVersion(ledgerStore, {
      schema: 'kb.release-version-proposal/1',
      flow: 'platform',
      channel: 'canary',
      candidateId: 'platform-1.0.0-canary',
      version: '1.0.0',
      bump: 'patch',
      baselineVersion: null,
      baselineSource: 'none',
      preconditions: { expectedTailSequence: -1, knownVersions: [] },
      proposedAt: AT,
      signature: null,
    }, { now: () => AT });

    const ctx = candidateContext({ ledgerStore });
    const gate = await advanceCandidateRelease(ctx);
    const cancelled = await cancelCandidateRelease(ctx, gate.receipt.receiptId, 'operator refused the release map');

    expect(cancelled.state).toBe('cancelled');
    expect(ctx.pipeline.countOf('discard')).toBe(1);
    const entries = await ledgerStore.read();
    expect(entries[0]!.state).toBe('cancelled');
  });
});

// ── candidate branch ──────────────────────────────────────────────────────────

describe('candidate branch orchestration', () => {
  it('drives plan → … → completed in the order §6A.4 fixes', async () => {
    const ctx = candidateContext();
    const done = await runCandidateToCompletion(ctx);

    expect(done.state).toBe('completed');
    expect(ctx.pipeline.calls).toEqual([
      'plan', 'source-checks', 'stage', 'package', 'seal', 'verify-bundle', 'release-map', 'commit',
    ]);
    expect(done.receipt.transitions.map(entry => entry.to)).toEqual([
      'planned',
      'source-checked',
      'staged',
      'bundled',
      'approved',
      'committed',
      'artifact-delivery-requested',
      'artifacts-published',
      'candidate-smoke-passed',
      'canary-activation-requested',
      'canary-active',
      'completed',
    ]);
  });

  it('renders the release map over sealed bytes and only then stops for approval', async () => {
    const ctx = candidateContext();
    const gate = await advanceCandidateRelease(ctx);
    // `release-map` must come after `seal`/`verify-bundle`, never before.
    expect(ctx.pipeline.calls.indexOf('release-map')).toBeGreaterThan(ctx.pipeline.calls.indexOf('verify-bundle'));
    expect(ctx.pipeline.countOf('commit')).toBe(0);
    expect(gate.awaitingApproval).toBe(true);
  });

  it('will not proceed past `bundled` without a recorded approval', async () => {
    const ctx = candidateContext();
    const gate = await advanceCandidateRelease(ctx);
    // Re-driving the same receipt with no approval recorded parks again rather
    // than continuing — there is no input that could say "approved".
    const again = await advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
    expect(again.state).toBe('bundled');
    expect(ctx.pipeline.countOf('commit')).toBe(0);
  });
});

// ── resume ────────────────────────────────────────────────────────────────────

describe('resume rules', () => {
  const crashPoints = [
    'publish-artifacts',
    'public-smoke',
    'commit-channel',
    'public-probe',
  ] as const;

  it.each(crashPoints)('resumes after a crash at %s without repeating a forbidden step', async (step) => {
    const adapters = createFakeAdapters();
    adapters.script.script(step, { kind: 'crash-after' });
    const pipeline = new SimulatedCandidatePipeline();
    const receiptStore = new InMemoryReceiptStore();
    const ctx = candidateContext({ receiptStore, pipeline, delivery: adapters.delivery, smoke: adapters.smoke, activation: adapters.activation });

    const gate = await advanceCandidateRelease(ctx);
    const approval = buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: {
        operation: 'candidate',
        intentSha256: canonicalSha256({ i: 1 }),
        bundleSha256: gate.receipt.bundleSha256!,
        requestedTarget: 'canary',
      },
      actor: ACTOR,
      at: AT,
    });
    await applyApproval(receiptStore, approval, gate.receipt);

    await expect(advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId }))
      .rejects.toBeInstanceOf(FakeReleaseCrash);

    // Resume: a brand-new driver over the same receipt.
    const resumed = await advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
    expect(resumed.state).toBe('completed');

    // Nothing rebuilt, and the plan was never re-run — the version is not duplicated.
    for (const forbidden of ['plan', 'stage', 'package', 'seal', 'commit'] as const) {
      expect(pipeline.countOf(forbidden)).toBe(1);
    }
    // The replayed call carried identical identity both times.
    const replays = adapters.script.calls.filter(call => call.step === step);
    expect(replays.length).toBeGreaterThanOrEqual(2);
    expect(new Set(replays.map(call => `${call.receiptId}|${call.candidateId}|${call.bundleSha256}|${call.target ?? ''}`)).size).toBe(1);
  });

  it.each(['source-checked', 'staged'] as const)('resumes a pre-bundle receipt at %s without re-planning', async (state) => {
    const receiptStore = new InMemoryReceiptStore();
    const pipeline = new SimulatedCandidatePipeline({
      failures: state === 'source-checked' ? { stage: 'crash' } : { seal: 'crash' },
    });
    const ctx = candidateContext({ receiptStore, pipeline });
    await expect(advanceCandidateRelease(ctx)).rejects.toThrow();
    const parked = (await receiptStore.list())[0]!;
    expect(parked.state).toBe(state);

    // A resume that had to re-run `plan` would allocate a second version.
    const healthy = candidateContext({ receiptStore, pipeline: new SimulatedCandidatePipeline() });
    const resumed = await advanceCandidateRelease({ ...healthy, receiptId: parked.receiptId });
    expect(resumed.state).toBe('bundled');
    expect((healthy.pipeline as SimulatedCandidatePipeline).countOf('plan')).toBe(0);
  });

  it('refuses to re-run a build step on a sealed receipt', async () => {
    const ctx = candidateContext();
    const gate = await advanceCandidateRelease(ctx);
    const { assertNoRebuild } = await import('../control-plane/saga-candidate.js');
    expect(() => assertNoRebuild(gate.receipt, 'stage'))
      .toThrowError(/must never run again once the bundle is sealed/);
  });
});

// ── failure semantics ─────────────────────────────────────────────────────────

describe('failure semantics split (execution plan item 7)', () => {
  async function ledgerWithReservation() {
    const store = new InMemoryReleaseLedgerStore();
    await reserveVersion(store, {
      schema: 'kb.release-version-proposal/1',
      flow: 'platform',
      channel: 'canary',
      candidateId: 'platform-1.0.0-canary',
      version: '1.0.0',
      bump: 'patch',
      baselineVersion: null,
      baselineSource: 'none',
      preconditions: { expectedTailSequence: -1, knownVersions: [] },
      proposedAt: AT,
      signature: null,
    }, { now: () => AT });
    return store;
  }

  it('parks a transient delivery failure in needs-attention without burning the version', async () => {
    const ledgerStore = await ledgerWithReservation();
    const adapters = createFakeAdapters();
    adapters.script.script('publish-artifacts',
      { kind: 'transient' }, { kind: 'transient' }, { kind: 'transient' });
    const receiptStore = new InMemoryReceiptStore();
    const ctx = candidateContext({
      receiptStore, ledgerStore, retryBudget: 3,
      delivery: adapters.delivery, smoke: adapters.smoke, activation: adapters.activation,
    });

    const gate = await advanceCandidateRelease(ctx);
    await applyApproval(receiptStore, buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: { operation: 'candidate', intentSha256: canonicalSha256({ i: 1 }), bundleSha256: gate.receipt.bundleSha256!, requestedTarget: 'canary' },
      actor: ACTOR, at: AT,
    }), gate.receipt);

    const parked = await advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
    expect(parked.state).toBe('needs-attention');
    expect(adapters.script.countOf('publish-artifacts')).toBe(3);
    // The infrastructure failed; the SemVer survives.
    expect((await ledgerStore.read())[0]!.state).toBe('reserved');
    // Each failed attempt is evidence on the same receipt, not a new intent.
    expect(parked.receipt.evidence.filter(entry => entry.kind === 'delivery-attempt-failed')).toHaveLength(3);

    // Resume needs no new approval and replays the same step.
    const resumed = await advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
    expect(resumed.state).toBe('completed');
    expect(resumed.receipt.transitions.filter(entry => entry.to === 'approved')).toHaveLength(1);
  });

  it('rejects on a functional smoke failure and burns the version', async () => {
    const ledgerStore = await ledgerWithReservation();
    const adapters = createFakeAdapters();
    adapters.script.script('public-smoke', { kind: 'reject' });
    const receiptStore = new InMemoryReceiptStore();
    const ctx = candidateContext({
      receiptStore, ledgerStore,
      delivery: adapters.delivery, smoke: adapters.smoke, activation: adapters.activation,
    });

    const gate = await advanceCandidateRelease(ctx);
    await applyApproval(receiptStore, buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: { operation: 'candidate', intentSha256: canonicalSha256({ i: 1 }), bundleSha256: gate.receipt.bundleSha256!, requestedTarget: 'canary' },
      actor: ACTOR, at: AT,
    }), gate.receipt);

    const rejected = await advanceCandidateRelease({ ...ctx, receiptId: gate.receipt.receiptId });
    expect(rejected.state).toBe('rejected');
    expect((await ledgerStore.read())[0]!.state).toBe('rejected');
  });

  it('rejects evidence belonging to another receipt, candidate or bundle', async () => {
    const { assertEvidenceMatches } = await import('../control-plane/adapters.js');
    const request = {
      receiptId: 'rcpt-a',
      candidateId: 'cand-a',
      expectedBundleSha256: 'a'.repeat(64),
      operation: 'publish-artifacts' as const,
    };
    const foreign = {
      schema: 'kb.delivery-evidence/1' as const,
      receiptId: 'rcpt-b',
      candidateId: 'cand-a',
      bundleSha256: 'a'.repeat(64),
      operation: 'publish-artifacts' as const,
      ciRunId: '1',
      observedAt: AT,
      artifacts: [],
      observedDistTags: [],
      result: 'succeeded' as const,
      signature: null,
    };
    expect(() => assertEvidenceMatches(request, foreign))
      .toThrowError(/does not match the request it answers/);
  });

  it('treats duplicate evidence as idempotent rather than as a second observation', async () => {
    const store = new InMemoryReceiptStore();
    await store.create({ kind: 'created', at: AT, actor: ACTOR, receiptId: 'r1', releaseId: 'platform-1.0.0', state: 'planned' });
    const evidence = { id: 'e1', kind: 'delivery-evidence' };
    await store.append('r1', { kind: 'evidence', at: AT, actor: ACTOR, evidence });
    await store.append('r1', { kind: 'evidence', at: AT, actor: ACTOR, evidence });
    expect((await store.read('r1'))!.evidence).toHaveLength(1);
  });
});

// ── stable promotion saga ─────────────────────────────────────────────────────

const PREVIOUS_POINTER = 'c'.repeat(64);
const NEXT_POINTER = 'd'.repeat(64);

async function completedCanary(receiptStore: InMemoryReceiptStore) {
  const ctx = candidateContext({ receiptStore });
  const done = await runCandidateToCompletion(ctx);
  return done.receipt;
}

function promotionPlan(candidate: { receiptId: string; releaseId: string; bundleSha256: string; indexSha256: string }) {
  return buildStablePromotionPlan({
    promotionId: 'promo-1',
    candidate,
    previous: {
      stablePointerSha256: PREVIOUS_POINTER,
      releaseId: 'platform-0.9.0',
      npmTags: [{ package: '@kb-labs/core-runtime', tag: 'latest', version: '0.9.0' }],
    },
    next: {
      stablePointerSha256: NEXT_POINTER,
      releaseId: candidate.releaseId,
      npmTags: [{ package: '@kb-labs/core-runtime', tag: 'latest', version: '1.0.0' }],
    },
    observation: { durationSeconds: 3600, minimumSamples: 1, triggers: ['failed-clean-install'] },
  });
}

function promotionContext(input: {
  receiptStore: InMemoryReceiptStore;
  adapters: FakeAdapterSet;
  overrides?: Partial<PromotionSagaContext>;
}): PromotionSagaContext {
  input.adapters.activation.setPointer('stable', PREVIOUS_POINTER, 'platform-0.9.0');
  return {
    receiptStore: input.receiptStore,
    leaseStore: new InMemoryLeaseStore(),
    journalStore: new InMemoryJournalStore(),
    activation: input.adapters.activation,
    observation: input.adapters.observation,
    actor: ACTOR,
    now: () => AT,
    ...input.overrides,
  };
}

async function promotionToApproval(ctx: PromotionSagaContext, plan: ReturnType<typeof promotionPlan>) {
  const checked = await advanceStablePromotion({ ...ctx, plan, candidateReceiptId: plan.candidate.receiptId });
  expect(checked.awaitingApproval).toBe(true);
  const approval = buildApproval({
    receiptId: checked.receipt.receiptId,
    decision: 'approved',
    subject: { operation: 'promotion', promotionPlanSha256: stablePromotionPlanSha256(plan) },
    actor: ACTOR,
    at: AT,
  });
  await applyApproval(ctx.receiptStore, approval, checked.receipt);
  return checked.receipt.receiptId;
}

describe('stable promotion saga', () => {
  it('runs Phase A→D and completes without any repository or artifact mutation', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters([
      { id: 's1', observedAt: AT, trigger: null, severity: 'info' },
    ]);
    const ctx = promotionContext({ receiptStore, adapters });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });

    const receiptId = await promotionToApproval(ctx, plan);
    const done = await advanceStablePromotion({ ...ctx, plan, receiptId });

    expect(done.state).toBe('completed');
    expect(done.receipt.transitions.map(entry => entry.to)).toEqual([
      'promotion-planned',
      'promotion-checked',
      'promotion-approved',
      'stable-preflight',
      'stable-staged',
      'stable-committing',
      'stable-active',
      'stable-observing',
      'completed',
    ]);
    // The one commit point ran after the derived aliases, and exactly once.
    const steps = adapters.script.calls.map(call => call.step);
    expect(steps.indexOf('commit-channel')).toBeGreaterThan(steps.indexOf('npm-alias'));
    expect(adapters.script.countOf('commit-channel')).toBe(1);
    expect((await adapters.activation.readPointer('stable')).pointerSha256).toBe(NEXT_POINTER);
    // The journal existed before the first mutation.
    expect(done.journal!.operations.find(op => op.authoritative)!.status).toBe('applied');
  });

  it('re-checks the pointer CAS precondition after taking the lease', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters();
    const ctx = promotionContext({ receiptStore, adapters });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });
    const receiptId = await promotionToApproval(ctx, plan);

    // Somebody else moved stable between approval and preflight.
    adapters.activation.setPointer('stable', 'e'.repeat(64), 'platform-0.9.1');
    await expect(advanceStablePromotion({ ...ctx, plan, receiptId }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch });
  });

  it('records a failed npm alias as degraded without compensating or blocking', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters([{ id: 's1', observedAt: AT, trigger: null, severity: 'info' }]);
    adapters.script.script('npm-alias', { kind: 'degraded' });
    const ctx = promotionContext({ receiptStore, adapters });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });
    const receiptId = await promotionToApproval(ctx, plan);
    const done = await advanceStablePromotion({ ...ctx, plan, receiptId });

    expect(done.state).toBe('completed');
    expect(done.degradedAliases).toContain('alias:@kb-labs/core-runtime@latest');
    expect((await adapters.activation.readPointer('stable')).pointerSha256).toBe(NEXT_POINTER);
  });

  it('compensates pointer-first when the public probe fails after the commit', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters();
    adapters.script.script('public-probe', { kind: 'reject' });
    const ctx = promotionContext({ receiptStore, adapters });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });
    const receiptId = await promotionToApproval(ctx, plan);
    const rolled = await advanceStablePromotion({ ...ctx, plan, receiptId });

    expect(rolled.state).toBe('rolled-back');
    expect((await adapters.activation.readPointer('stable')).pointerSha256).toBe(PREVIOUS_POINTER);
    // Compensation ran before any alias restoration touched anything.
    const steps = adapters.script.calls.map(call => call.step);
    expect(steps.indexOf('compensate-channel')).toBeLessThan(steps.lastIndexOf('npm-alias'));
  });

  it.each(['stage-channel', 'commit-channel'] as const)(
    'survives a crash after the %s mutation and resumes from the receipt',
    async (step) => {
      const receiptStore = new InMemoryReceiptStore();
      const canary = await completedCanary(receiptStore);
      const adapters = createFakeAdapters([{ id: 's1', observedAt: AT, trigger: null, severity: 'info' }]);
      adapters.script.script(step, { kind: 'crash-after' });
      const ctx = promotionContext({ receiptStore, adapters });
      const plan = promotionPlan({
        receiptId: canary.receiptId,
        releaseId: canary.releaseId,
        bundleSha256: canary.bundleSha256!,
        indexSha256: canary.indexSha256!,
      });
      const receiptId = await promotionToApproval(ctx, plan);

      await expect(advanceStablePromotion({ ...ctx, plan, receiptId })).rejects.toBeInstanceOf(FakeReleaseCrash);
      const resumed = await advanceStablePromotion({ ...ctx, plan, receiptId });
      expect(['completed', 'rolled-back']).toContain(resumed.state);
      expect((await adapters.activation.readPointer('stable')).pointerSha256).toBe(
        resumed.state === 'completed' ? NEXT_POINTER : PREVIOUS_POINTER,
      );
    },
  );

  it('blocks every later stable promotion after a failed compensation', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters();
    adapters.script.script('public-probe', { kind: 'reject' });
    // Compensation itself keeps failing.
    adapters.script.script('compensate-channel', { kind: 'reject' }, { kind: 'reject' }, { kind: 'reject' });
    const ctx = promotionContext({ receiptStore, adapters });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });
    const receiptId = await promotionToApproval(ctx, plan);
    const stuck = await advanceStablePromotion({ ...ctx, plan, receiptId });

    expect(stuck.state).toBe('rollback-needs-attention');
    expect(stuck.journal!.operations.find(op => op.authoritative)!.status).toBe('compensation-failed');

    // A brand-new promotion must refuse to start at all.
    await expect(advanceStablePromotion({
      ...ctx,
      plan: { ...plan, promotionId: 'promo-2' },
      candidateReceiptId: canary.receiptId,
    })).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.StablePromotionBlocked });

    // The sealed compensation may be retried without a second approval.
    const rearmed = await retryStableCompensation(ctx, receiptId, 'operator restored registry access');
    expect(rearmed.state).toBe('rollback-requested');
  });

  it('refuses a second concurrent promotion while the lease is held', async () => {
    const receiptStore = new InMemoryReceiptStore();
    const canary = await completedCanary(receiptStore);
    const adapters = createFakeAdapters();
    const leaseStore = new InMemoryLeaseStore();
    const ctx = promotionContext({ receiptStore, adapters, overrides: { leaseStore } });
    const plan = promotionPlan({
      receiptId: canary.receiptId,
      releaseId: canary.releaseId,
      bundleSha256: canary.bundleSha256!,
      indexSha256: canary.indexSha256!,
    });
    await leaseStore.acquire({
      schema: 'kb.release-lease/1',
      key: plan.leaseKey,
      holder: 'rcpt-someone-else',
      actor: 'other',
      acquiredAt: AT,
      expiresAt: '2099-01-01T00:00:00Z',
    });
    const receiptId = await promotionToApproval(ctx, plan);
    await expect(advanceStablePromotion({ ...ctx, plan, receiptId }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.StableLeaseHeld });
  });

  it('lets a crashed promotion reclaim its own lease on resume', async () => {
    const store = new FileLeaseStore(tempDir());
    const lease = {
      schema: 'kb.release-lease/1' as const,
      key: 'stable-promotion',
      holder: 'rcpt-promo-1',
      actor: ACTOR,
      acquiredAt: AT,
      expiresAt: '2099-01-01T00:00:00Z',
    };
    await store.acquire(lease);
    await expect(store.acquire(lease)).resolves.toMatchObject({ holder: 'rcpt-promo-1' });
    await expect(store.acquire({ ...lease, holder: 'rcpt-promo-2' }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.StableLeaseHeld });
  });
});

describe('observation window policy (Phase D)', () => {
  const plan = buildStablePromotionPlan({
    promotionId: 'promo-1',
    candidate: { receiptId: 'r', releaseId: 'platform-1.0.0', bundleSha256: 'a'.repeat(64), indexSha256: 'b'.repeat(64) },
    previous: { stablePointerSha256: PREVIOUS_POINTER, releaseId: 'platform-0.9.0' },
    next: { stablePointerSha256: NEXT_POINTER, releaseId: 'platform-1.0.0' },
    observation: { durationSeconds: 600, minimumSamples: 2, triggers: ['failed-clean-install'] },
  });

  it('closes only on enough samples and no sealed trigger', () => {
    expect(evaluateObservationWindow(plan, []).outcome).toBe('insufficient');
    expect(evaluateObservationWindow(plan, [
      { id: '1', observedAt: AT, trigger: null, severity: 'info' },
      { id: '2', observedAt: AT, trigger: null, severity: 'warning' },
    ]).outcome).toBe('passed');
  });

  it('rolls back only on a critical signal naming a sealed trigger', () => {
    expect(evaluateObservationWindow(plan, [
      { id: '1', observedAt: AT, trigger: 'failed-clean-install', severity: 'critical' },
    ])).toEqual({ outcome: 'rollback', trigger: 'failed-clean-install' });
    // An undefined signal cannot roll stable back on its own (§3C Phase D).
    expect(evaluateObservationWindow(plan, [
      { id: '1', observedAt: AT, trigger: 'some-unlisted-alarm', severity: 'critical' },
      { id: '2', observedAt: AT, trigger: null, severity: 'critical' },
    ]).outcome).toBe('passed');
  });
});

describe('compensation journal', () => {
  it('marks exactly one operation authoritative and derives it from the sealed plan', () => {
    const plan = buildStablePromotionPlan({
      promotionId: 'promo-1',
      candidate: { receiptId: 'r', releaseId: 'platform-1.0.0', bundleSha256: 'a'.repeat(64), indexSha256: 'b'.repeat(64) },
      previous: { stablePointerSha256: PREVIOUS_POINTER, releaseId: 'platform-0.9.0', npmTags: [{ package: 'p', tag: 'latest', version: '0.9.0' }] },
      next: { stablePointerSha256: NEXT_POINTER, releaseId: 'platform-1.0.0', npmTags: [{ package: 'p', tag: 'latest', version: '1.0.0' }] },
      observation: { durationSeconds: 600, minimumSamples: 0, triggers: [] },
    });
    const journal = buildPromotionJournal({ plan, receiptId: 'rcpt-promo-1', createdAt: AT });
    expect(journal.operations.filter(op => op.authoritative)).toHaveLength(1);
    expect(journal.operations.find(op => op.id === 'alias:p@latest')!.from).toBe('0.9.0');
    expect(journal.planSha256).toBe(stablePromotionPlanSha256(plan));
  });
});
