/**
 * PR 6 DoD, the ordering half: "crash between tag writes, pointer-first
 * compensation and compensation-retry".
 *
 * PR 5 already asserted all three against `createFakeAdapters()`. That proved
 * the *saga* orders its calls correctly; it could not prove that the real,
 * CAS-backed adapters satisfy the same contract, because the fakes are the ones
 * that were substituted for them. So these tests keep PR 5's state machine
 * untouched and swap in `CiActivationAdapter` over a real conditional-write
 * store, a real sealed bundle and a real npm registry fake — the only things
 * still simulated are the transports themselves.
 *
 * The stable pointer here is not a placeholder digest: it is
 * `canonicalSha256` of the pointer document actually stored in the CAS, so a
 * precondition that "passes" because both sides are the same made-up constant
 * would show up as a failure rather than as a green test.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseControlDiagnosticCode,
  canonicalSha256,
  type DeliveryEvidence,
  type ReleaseDeliveryRequest,
  type ReleaseReceiptState,
  type StablePromotionPlan,
} from '@kb-labs/release-manager-contracts';

import {
  CiActivationAdapter,
  InMemoryCasStore,
  InMemoryJournalStore,
  InMemoryLeaseStore,
  InMemoryNpmRegistry,
  InMemoryReceiptStore,
  InMemoryReleaseAssetStore,
  LocalBundleFetcher,
  advanceStablePromotion,
  applyApproval,
  buildApproval,
  buildDeliveryRequest,
  buildStablePromotionPlan,
  channelPointerKey,
  createFakeAdapters,
  rejectingFailure,
  stablePromotionPlanSha256,
  transientFailure,
  transitionReceipt,
  type CasPrecondition,
  type CasObject,
  type PromotionSagaContext,
} from '../control-plane/index.js';
import {
  GOLDEN_PLATFORM_VERSION,
  buildDeliveryBundle,
  sealedPointer,
  type DeliveryBundle,
} from './fixtures/delivery-bundle.js';

const ACTOR = 'kirill';
const AT = '2026-08-31T09:00:00Z';
const RUNTIME_PACKAGE = '@kb-labs/core-runtime';
const PREVIOUS_RELEASE_ID = 'platform-2.118.0';
const PREVIOUS_RUNTIME_VERSION = '2.118.0';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-delivery-int-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

// ── traced doubles: ordering across two different stores ─────────────────────
//
// `cas.writes` and `npm.tagMoves` each record their own store's history, and
// "the pointer went back before anything touched an alias" is a statement about
// the *interleaving* of the two. A shared timeline is the only thing that can
// witness it.

class TracedCasStore extends InMemoryCasStore {
  /** Key whose next successful write is followed by a process-level crash. */
  crashAfterWriteTo: string | null = null;
  /** Key whose writes start failing once `attempts` of them have been made. */
  refuseWritesTo: { key: string; after: number } | null = null;
  private readonly attempts = new Map<string, number>();

  constructor(private readonly timeline: string[]) { super(); }

  override async putIfMatch(key: string, body: string, expected: CasPrecondition): Promise<CasObject> {
    const attempt = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempt);
    if (this.refuseWritesTo?.key === key && attempt > this.refuseWritesTo.after) {
      throw transientFailure(`the pointer endpoint refuses writes to ${key}`);
    }

    const result = await super.putIfMatch(key, body, expected);
    this.timeline.push(`cas:${key}`);
    if (this.crashAfterWriteTo === key) {
      this.crashAfterWriteTo = null;
      // Not a `ReleaseAdapterError`: this is the runner dying, not a delivery
      // outcome, and the saga must treat the two differently.
      throw new Error('the CI runner was terminated after the conditional write landed');
    }
    return result;
  }
}

class TracedNpmRegistry extends InMemoryNpmRegistry {
  constructor(private readonly timeline: string[]) { super(); }

  override async moveDistTag(input: { name: string; version: string; tag: string }): Promise<void> {
    this.timeline.push(`alias:${input.name}@${input.tag}=${input.version}`);
    return super.moveDistTag(input);
  }
}

/** A real activation adapter whose public probe is scripted to reject once. */
class ProbeRejectingActivation extends CiActivationAdapter {
  private remaining: number;

  constructor(options: ConstructorParameters<typeof CiActivationAdapter>[0], rejections = 1) {
    super(options);
    this.remaining = rejections;
  }

  override async probePublic(input: Parameters<CiActivationAdapter['probePublic']>[0]): Promise<DeliveryEvidence> {
    if (this.remaining > 0) {
      this.remaining -= 1;
      throw rejectingFailure(`scripted public ${input.channel} probe failure after the pointer commit`);
    }
    return super.probePublic(input);
  }
}

// ── fixture ──────────────────────────────────────────────────────────────────

/** The canary receipt a promotion selects, walked to `completed` through the real table. */
const CANARY_PATH: readonly ReleaseReceiptState[] = [
  'source-checked', 'staged', 'bundled', 'approved', 'committed',
  'artifact-delivery-requested', 'artifacts-published', 'candidate-smoke-passed',
  'canary-activation-requested', 'canary-active', 'completed',
];

async function completedCanary(
  receiptStore: InMemoryReceiptStore,
  bundle: DeliveryBundle,
): Promise<string> {
  const receiptId = 'rcpt-canary-golden';
  await receiptStore.create({
    kind: 'created',
    at: AT,
    actor: ACTOR,
    receiptId,
    releaseId: bundle.releaseId,
    state: 'planned',
    binding: {
      candidateId: bundle.candidateId,
      bundleSha256: bundle.bundleSha256,
      indexSha256: bundle.indexSha256,
    },
  });
  for (const to of CANARY_PATH) {
    await transitionReceipt(receiptStore, receiptId, to, { actor: ACTOR, at: AT });
  }
  return receiptId;
}

interface PromotionHarness {
  ctx: PromotionSagaContext;
  plan: StablePromotionPlan;
  cas: TracedCasStore;
  npm: TracedNpmRegistry;
  timeline: string[];
  bundle: DeliveryBundle;
  dir: string;
  previous: ReturnType<typeof sealedPointer>;
  activationOptions: {
    fetcher: LocalBundleFetcher;
    npm: TracedNpmRegistry;
    assets: InMemoryReleaseAssetStore;
    cas: TracedCasStore;
    ciRunId: string;
    now: () => string;
  };
}

async function promotionHarness(options: {
  activation?: (base: PromotionHarness['activationOptions']) => PromotionSagaContext['activation'];
} = {}): Promise<PromotionHarness> {
  const dir = tempDir();
  const previous = sealedPointer('stable', PREVIOUS_RELEASE_ID);
  // The bundle ships both authorised pointer values: its own next pointer, and
  // the compensation target the same approval covers.
  const bundle = buildDeliveryBundle(dir, { channel: 'stable', alsoSeal: [previous] });

  const timeline: string[] = [];
  const cas = new TracedCasStore(timeline);
  const npm = new TracedNpmRegistry(timeline);
  cas.seed(channelPointerKey('stable'), previous.body);
  npm.seed(RUNTIME_PACKAGE, PREVIOUS_RUNTIME_VERSION, 'a'.repeat(64), { latest: PREVIOUS_RUNTIME_VERSION });
  npm.seed(RUNTIME_PACKAGE, GOLDEN_PLATFORM_VERSION, 'b'.repeat(64));

  const activationOptions = {
    fetcher: new LocalBundleFetcher(),
    npm,
    assets: new InMemoryReleaseAssetStore(),
    cas,
    ciRunId: 'ci-run-integration',
    now: () => AT,
  };

  const receiptStore = new InMemoryReceiptStore();
  const canaryReceiptId = await completedCanary(receiptStore, bundle);

  const plan = buildStablePromotionPlan({
    promotionId: 'promo-real-1',
    candidate: {
      receiptId: canaryReceiptId,
      // The saga carries the candidate's identity in `releaseId` (there is no
      // `candidateId` on `CandidateIdentity`), and the delivery request derives
      // its `candidateId` from it — so this must be the bundle's candidate id.
      releaseId: bundle.candidateId,
      bundleSha256: bundle.bundleSha256,
      indexSha256: bundle.indexSha256,
    },
    previous: {
      stablePointerSha256: previous.sha256,
      releaseId: PREVIOUS_RELEASE_ID,
      npmTags: [{ package: RUNTIME_PACKAGE, tag: 'latest', version: PREVIOUS_RUNTIME_VERSION }],
    },
    next: {
      stablePointerSha256: bundle.pointer.sha256,
      releaseId: bundle.releaseId,
      npmTags: [{ package: RUNTIME_PACKAGE, tag: 'latest', version: GOLDEN_PLATFORM_VERSION }],
    },
    observation: { durationSeconds: 3600, minimumSamples: 1, triggers: ['failed-clean-install'] },
  });

  const fakes = createFakeAdapters([{ id: 's1', observedAt: AT, trigger: null, severity: 'info' }]);
  const ctx: PromotionSagaContext = {
    receiptStore,
    leaseStore: new InMemoryLeaseStore(),
    journalStore: new InMemoryJournalStore(),
    activation: options.activation
      ? options.activation(activationOptions)
      : new CiActivationAdapter(activationOptions),
    observation: fakes.observation,
    actor: ACTOR,
    now: () => AT,
    bundleUriFor: () => `file://${dir}`,
  };

  return { ctx, plan, cas, npm, timeline, bundle, dir, previous, activationOptions };
}

async function approve(harness: PromotionHarness): Promise<string> {
  const checked = await advanceStablePromotion({
    ...harness.ctx, plan: harness.plan, candidateReceiptId: harness.plan.candidate.receiptId,
  });
  expect(checked.awaitingApproval).toBe(true);
  await applyApproval(harness.ctx.receiptStore, buildApproval({
    receiptId: checked.receipt.receiptId,
    decision: 'approved',
    subject: { operation: 'promotion', promotionPlanSha256: stablePromotionPlanSha256(harness.plan) },
    actor: ACTOR,
    at: AT,
  }), checked.receipt);
  return checked.receipt.receiptId;
}

/** Digest of whatever the CAS currently serves for the stable channel. */
async function livePointerSha256(cas: InMemoryCasStore): Promise<string | null> {
  const object = await cas.read(channelPointerKey('stable'));
  return object ? canonicalSha256(JSON.parse(object.body) as unknown) : null;
}

function pointerWrites(cas: InMemoryCasStore): number {
  return cas.writes.filter(write => write.key === channelPointerKey('stable')).length;
}

// ── the happy path over real CAS ─────────────────────────────────────────────

describe('INT-01 stable promotion over the real CAS-backed adapters', () => {
  it('stages non-publicly, moves aliases, then commits the pointer exactly once', async () => {
    const harness = await promotionHarness();
    const receiptId = await approve(harness);

    const done = await advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId });

    expect(done.state).toBe('completed');
    expect(await livePointerSha256(harness.cas)).toBe(harness.bundle.pointer.sha256);
    expect(pointerWrites(harness.cas)).toBe(1);

    // Staging happened, and it happened somewhere no launcher resolves.
    const stagingWrites = harness.cas.writes.filter(write => write.key.startsWith('staging/'));
    expect(stagingWrites).toHaveLength(1);

    // §6A.1.5: the authoritative pointer CAS is last, after the derived aliases.
    const pointerAt = harness.timeline.indexOf(`cas:${channelPointerKey('stable')}`);
    const aliasAt = harness.timeline.findIndex(entry => entry.startsWith('alias:'));
    expect(aliasAt).toBeGreaterThanOrEqual(0);
    expect(pointerAt).toBeGreaterThan(aliasAt);
    expect(done.journal!.operations.find(operation => operation.authoritative)!.status).toBe('applied');
  });

  it('refuses to promote when the live pointer drifted between approval and preflight', async () => {
    const harness = await promotionHarness();
    const receiptId = await approve(harness);

    // Somebody else moved stable in the meantime, in the real store.
    harness.cas.seed(channelPointerKey('stable'), sealedPointer('stable', 'platform-2.118.9').body);

    await expect(advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch });
    expect(pointerWrites(harness.cas)).toBe(0);
  });
});

// ── crash between the write and its acknowledgement ──────────────────────────

describe('INT-02 crash after the pointer CAS landed', () => {
  it('resumes by observing the remote pointer instead of replaying the write', async () => {
    const harness = await promotionHarness();
    const receiptId = await approve(harness);
    harness.cas.crashAfterWriteTo = channelPointerKey('stable');

    await expect(advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId }))
      .rejects.toThrow(/runner was terminated after the conditional write landed/);
    // The world moved even though the journal never learned it did.
    expect(await livePointerSha256(harness.cas)).toBe(harness.bundle.pointer.sha256);

    const resumed = await advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId });

    expect(resumed.state).toBe('completed');
    // Replaying the CAS would have failed its own precondition and been misread
    // as a failed promotion; the resume observed it instead.
    expect(pointerWrites(harness.cas)).toBe(1);
    expect(resumed.receipt.transitions.map(entry => entry.to)).toContain('stable-active');
  });
});

// ── pointer-first compensation, against the real adapter ─────────────────────

describe('INT-03 pointer-first compensation', () => {
  it('restores the previous sealed pointer before touching any derived alias', async () => {
    const harness = await promotionHarness({
      activation: options => new ProbeRejectingActivation(options),
    });
    const receiptId = await approve(harness);

    const rolled = await advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId });

    expect(rolled.state).toBe('rolled-back');
    // The compensation published the *previous* sealed bytes — which are not
    // this bundle's own pointer, and were never rendered in CI.
    expect(await livePointerSha256(harness.cas)).toBe(harness.previous.sha256);
    expect(pointerWrites(harness.cas)).toBe(2);

    const compensationAt = harness.timeline.lastIndexOf(`cas:${channelPointerKey('stable')}`);
    const lastAliasAt = harness.timeline.map(entry => entry.startsWith('alias:')).lastIndexOf(true);
    expect(compensationAt).toBeLessThan(lastAliasAt);
    // The alias went back to the version the sealed plan recorded, not to a guess.
    expect(harness.npm.tagMoves.at(-1)).toMatchObject({
      name: RUNTIME_PACKAGE, tag: 'latest', version: PREVIOUS_RUNTIME_VERSION,
    });
  });

  it('a replayed compensation is idempotent rather than a second write', async () => {
    const harness = await promotionHarness({
      activation: options => new ProbeRejectingActivation(options),
    });
    const receiptId = await approve(harness);
    await advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId });
    const writesAfterRollback = pointerWrites(harness.cas);

    // Exactly the request the saga issued, re-issued against the real adapter —
    // the retry of a compensation whose acknowledgement was lost.
    const replay: ReleaseDeliveryRequest = buildDeliveryRequest({
      receiptId,
      candidateId: harness.plan.candidate.releaseId,
      bundleUri: `file://${harness.dir}`,
      bundleSha256: harness.plan.candidate.bundleSha256,
      stepId: 'compensate-stable-pointer',
      operation: 'compensate-channel',
      targetChannel: 'stable',
      expectedPreviousPointerSha256: harness.plan.next.stablePointerSha256,
      pointerPlanSha256: harness.plan.previous.stablePointerSha256!,
    });
    const evidence = await new CiActivationAdapter(harness.activationOptions).commitChannel(replay);

    expect(evidence.artifacts[0]!.sha256).toBe(harness.previous.sha256);
    expect(pointerWrites(harness.cas)).toBe(writesAfterRollback);
    expect(await livePointerSha256(harness.cas)).toBe(harness.previous.sha256);
  });

  it('leaves the promotion needing attention when the restoring write cannot land', async () => {
    const harness = await promotionHarness({
      activation: options => new ProbeRejectingActivation(options),
    });
    const receiptId = await approve(harness);
    // The first pointer write — the commit — succeeds; every write after it,
    // which is only ever the compensation, is refused by the endpoint.
    harness.cas.refuseWritesTo = { key: channelPointerKey('stable'), after: 1 };

    const outcome = await advanceStablePromotion({ ...harness.ctx, plan: harness.plan, receiptId });

    expect(outcome.state).toBe('rollback-needs-attention');
    // Stable is still pointing at the promoted release, and that is exactly the
    // drift a human has to reconcile — it is not quietly reported as rolled back.
    expect(await livePointerSha256(harness.cas)).toBe(harness.bundle.pointer.sha256);
    expect(outcome.journal!.operations.find(operation => operation.authoritative)!.status)
      .toBe('compensation-failed');
  });
});
