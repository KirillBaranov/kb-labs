/**
 * The fullest end-to-end the release control plane can be driven to *inside a
 * sandbox* (execution plan PR 8 item 1).
 *
 * ## What this is, and what it deliberately is not
 *
 * It is not §3D of the cutover plan. §3D is a production acceptance test: it
 * downloads a script from a public endpoint on a clean machine, installs a
 * launcher from a real GitHub Release, and resolves a real npm registry. None of
 * those exist here, and a test that pretended to do them would be worth less
 * than no test at all.
 *
 * What it *is*: the whole candidate→canary→stable path driven through PR 5's
 * two sagas over PR 6's **real** adapters — `CiDeliveryAdapter`,
 * `CiSmokeAdapter`, `CiActivationAdapter` — against a **real sealed bundle on
 * disk** that `verifyBundleDirectory` accepts. The only simulated things left
 * are the three transports underneath those adapters (npm, the GitHub Release
 * asset store, the CAS endpoint) and the build that produces the bundle.
 *
 * That boundary is the point. PR 5's own tests substituted `createFakeAdapters`
 * for the whole delivery plane, so they proved the state machine orders its
 * calls and nothing about whether the real adapters accept those calls. PR 6's
 * `control-plane-delivery-integration.test.ts` closed half of that for the
 * promotion saga. This file closes the other half — the candidate branch — and
 * then, crucially, hands the *same* candidate to the promotion saga, which is
 * the one assertion neither file could make alone: §3D step 8, that canary
 * delivery and stable promotion refer to one
 * `candidateId`/`bundleSha256`/`indexSha256`.
 *
 * The scenario list is execution plan PR 8 item 1: happy canary→stable, a
 * rejected experimental target, duplicate delivery, an altered bundle,
 * mismatched evidence and an interrupted workflow.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalSha256,
  type DeliveryEvidence,
  type ReleaseReceipt,
} from '@kb-labs/release-manager-contracts';

import {
  CiActivationAdapter,
  CiDeliveryAdapter,
  CiSmokeAdapter,
  InMemoryCasStore,
  InMemoryJournalStore,
  InMemoryLeaseStore,
  InMemoryNpmRegistry,
  InMemoryReceiptStore,
  InMemoryReleaseAssetStore,
  LocalBundleFetcher,
  SimulatedCandidatePipeline,
  advanceCandidateRelease,
  advanceStablePromotion,
  applyApproval,
  buildApproval,
  buildDeliveryRequest,
  buildStablePromotionPlan,
  channelPointerKey,
  createFakeAdapters,
  stablePromotionPlanSha256,
  type CandidateSagaContext,
  type PipelinePlanResult,
  type PromotionSagaContext,
  type SmokeRunner,
} from '../control-plane/index.js';
import {
  GOLDEN_PLATFORM_VERSION,
  buildDeliveryBundle,
  sealedPointer,
  type DeliveryBundle,
} from './fixtures/delivery-bundle.js';

const ACTOR = 'kirill';
const AT = '2026-08-31T12:00:00Z';
const FLOW = 'platform';
const RUNTIME_PACKAGE = '@kb-labs/core-runtime';
const PREVIOUS_RELEASE_ID = 'platform-2.118.0';
const PREVIOUS_RUNTIME_VERSION = '2.118.0';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-e2e-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

// ── the one thing still simulated on the producing side ──────────────────────
//
// `SimulatedCandidatePipeline` invents digests, which is exactly wrong for a
// test whose whole claim is "the real adapters accepted the real bytes". This
// subclass keeps the pipeline's call accounting — the resume assertions depend
// on it — and replaces its four synthetic outputs with the actual sealed bundle
// written to disk. Everything downstream of `seal` therefore sees bytes the
// verifier accepts, and a digest that would fail if a single byte moved.

class RealBundlePipeline extends SimulatedCandidatePipeline {
  constructor(
    private readonly bundle: DeliveryBundle,
    private readonly bundleDir: string,
    options: ConstructorParameters<typeof SimulatedCandidatePipeline>[0] = {},
  ) {
    super({
      flow: FLOW,
      version: GOLDEN_PLATFORM_VERSION,
      candidateId: bundle.candidateId,
      ...options,
    });
  }

  override async package(): Promise<{ bundleDir: string }> {
    await super.package();
    return { bundleDir: this.bundleDir };
  }

  override async seal(input: { plan: PipelinePlanResult; bundleDir: string }) {
    const simulated = await super.seal(input);
    return {
      ...simulated,
      bundleDir: this.bundleDir,
      bundleSha256: this.bundle.bundleSha256,
      indexSha256: this.bundle.indexSha256,
    };
  }
}

/** A smoke runner that reports on the exact identity it was handed. */
function passingSmoke(seen: unknown[] = []): SmokeRunner {
  return {
    async run(input) { seen.push(input); return { ok: true }; },
  };
}

// ── the harness ──────────────────────────────────────────────────────────────

interface CandidateHarness {
  ctx: CandidateSagaContext;
  bundle: DeliveryBundle;
  bundleDir: string;
  cas: InMemoryCasStore;
  npm: InMemoryNpmRegistry;
  assets: InMemoryReleaseAssetStore;
  pipeline: RealBundlePipeline;
  evidence: DeliveryEvidence[];
  smokeCalls: unknown[];
  receiptStore: InMemoryReceiptStore;
  previousStable: ReturnType<typeof sealedPointer>;
  stableNext: ReturnType<typeof sealedPointer>;
}

function candidateHarness(options: {
  smoke?: SmokeRunner;
  /** Mutates the bundle directory after it is sealed, to forge an altered bundle. */
  tamper?: (bundleDir: string) => void;
} = {}): CandidateHarness {
  const bundleDir = tempDir();
  // The candidate seals its own canary pointer; `alsoSeal` carries the pointer
  // the later stable promotion has to be able to compensate back to, because a
  // compensation may only publish bytes some approval already covered.
  const previousStable = sealedPointer('stable', PREVIOUS_RELEASE_ID);
  const stableNext = sealedPointer('stable', `platform-${GOLDEN_PLATFORM_VERSION}`);
  const bundle = buildDeliveryBundle(bundleDir, {
    channel: 'canary',
    // The candidate's own activation target, at `pointers/canary.json`.
    alsoSeal: [previousStable],
    // …and the pointer a later stable promotion of these same bytes will stage
    // and commit. Both are sealed by the plugin, under the same approval, in the
    // one bundle: CI renders no pointer of its own, so a promotion of a bundle
    // that sealed only its canary pointer has nothing to publish.
    golden: { extraFiles: { 'pointers/stable.json': stableNext.body } },
  });
  options.tamper?.(bundleDir);

  const cas = new InMemoryCasStore();
  const npm = new InMemoryNpmRegistry();
  const assets = new InMemoryReleaseAssetStore();
  const evidence: DeliveryEvidence[] = [];
  const smokeCalls: unknown[] = [];

  const ciOptions = {
    fetcher: new LocalBundleFetcher(),
    npm,
    assets,
    cas,
    ciRunId: 'ci-run-e2e',
    now: () => AT,
    emit: (item: DeliveryEvidence) => { evidence.push(item); },
  };

  const pipeline = new RealBundlePipeline(bundle, bundleDir);
  const receiptStore = new InMemoryReceiptStore();

  const ctx: CandidateSagaContext = {
    receiptStore,
    pipeline,
    delivery: new CiDeliveryAdapter(ciOptions),
    smoke: new CiSmokeAdapter({
      runner: options.smoke ?? passingSmoke(smokeCalls),
      ciRunId: ciOptions.ciRunId,
      now: ciOptions.now,
    }),
    activation: new CiActivationAdapter(ciOptions),
    flow: FLOW,
    actor: ACTOR,
    bundleDirFor: () => bundleDir,
    bundleUriFor: () => `file://${bundleDir}`,
    now: () => AT,
  };

  return {
    ctx, bundle, bundleDir, cas, npm, assets, pipeline, evidence, smokeCalls, receiptStore,
    previousStable, stableNext,
  };
}

/** Drives a candidate to `bundled`, records the one approval, and returns the receipt id. */
async function approvedCandidate(harness: CandidateHarness): Promise<string> {
  const gate = await advanceCandidateRelease(harness.ctx);
  expect(gate.awaitingApproval).toBe(true);
  expect(gate.state).toBe('bundled');
  // §3.4/S0.3f: what the human signs is the sealed bundle's digest.
  expect(gate.releaseMap!.bundleSha256).toBe(harness.bundle.bundleSha256);

  const plan = await harness.pipeline.rehydrate();
  await applyApproval(harness.ctx.receiptStore, buildApproval({
    receiptId: gate.receipt.receiptId,
    decision: 'approved',
    subject: {
      operation: 'candidate',
      intentSha256: plan.intentSha256,
      bundleSha256: harness.bundle.bundleSha256,
      requestedTarget: 'canary',
    },
    actor: ACTOR,
    at: AT,
  }), gate.receipt);
  return gate.receipt.receiptId;
}

async function livePointer(cas: InMemoryCasStore, channel: string): Promise<string | null> {
  const object = await cas.read(channelPointerKey(channel));
  return object ? canonicalSha256(JSON.parse(object.body) as unknown) : null;
}

// ── E2E-01: the candidate branch, over the real delivery plane ───────────────

describe('E2E-01 candidate → canary over the real adapters', () => {
  it('publishes the sealed bytes, smokes them and activates the canary pointer', async () => {
    const harness = candidateHarness();
    const receiptId = await approvedCandidate(harness);

    const done = await advanceCandidateRelease({ ...harness.ctx, receiptId });

    expect(done.state).toBe('completed');

    // The npm registry received the exact tarballs the bundle's packaging record
    // names — three of them — under a candidate-scoped dist-tag, never a channel
    // tag. Publishing to `latest` here would make a canary the default install.
    const published = harness.npm.published.map(entry => `${entry.name}@${entry.version}`);
    expect(published).toEqual([
      `${RUNTIME_PACKAGE}@${GOLDEN_PLATFORM_VERSION}`,
      `@kb-labs/plugin-release@${GOLDEN_PLATFORM_VERSION}`,
      expect.stringContaining('@kb-labs/sdk@'),
    ]);
    expect(harness.npm.tagMoves.every(move => move.tag.startsWith('candidate-'))).toBe(true);

    // Both launcher binaries reached the asset store keyed by os/arch, alongside
    // the sealed index that names them. Two binaries called `kb-create` would
    // silently collapse into one asset, which is why the os/arch is in the name.
    expect(harness.assets.uploads.map(upload => upload.name).sort())
      .toEqual(['kb-create-darwin-arm64', 'kb-create-linux-amd64', 'release-index.json']);

    // The canary pointer is live, and it is the bundle's own sealed pointer —
    // CI never rendered one of its own.
    expect(await livePointer(harness.cas, 'canary')).toBe(harness.bundle.pointer.sha256);
    // Exactly one authoritative write. `stable` was never touched by a canary.
    expect(harness.cas.writes.filter(w => w.key === channelPointerKey('canary'))).toHaveLength(1);
    expect(await livePointer(harness.cas, 'stable')).toBeNull();

    // The smoke ran against the candidate's identity, not against a channel.
    expect(harness.smokeCalls).toEqual([{
      receiptId,
      candidateId: harness.bundle.candidateId,
      releaseId: harness.bundle.releaseId,
      bundleSha256: harness.bundle.bundleSha256,
    }]);

    // Every emitted evidence document is bound to this bundle's digest.
    expect(harness.evidence.length).toBeGreaterThan(0);
    expect(harness.evidence.every(item => item.bundleSha256 === harness.bundle.bundleSha256)).toBe(true);

    // Nothing was rebuilt after sealing.
    expect(harness.pipeline.countOf('seal')).toBe(1);
    expect(harness.pipeline.countOf('package')).toBe(1);
    expect(harness.pipeline.countOf('commit')).toBe(1);
  });
});

// ── E2E-02: the same candidate, promoted ─────────────────────────────────────

describe('E2E-02 canary → stable promotion of that same candidate', () => {
  it('completes without producing a single new artifact, over one identity', async () => {
    const harness = candidateHarness();
    const canaryReceiptId = await approvedCandidate(harness);
    const canary = await advanceCandidateRelease({ ...harness.ctx, receiptId: canaryReceiptId });
    expect(canary.state).toBe('completed');

    // Freeze what the canary produced, so "the promotion created nothing" is a
    // statement about a real before/after rather than about an empty store.
    const publishesAfterCanary = harness.npm.published.length;
    const assetsAfterCanary = harness.assets.uploads.length;
    const canaryPointerSha = await livePointer(harness.cas, 'canary');

    // A stable channel that already points somewhere, so the CAS precondition is
    // a real one rather than a first-ever write.
    const previous = harness.previousStable;
    harness.cas.seed(channelPointerKey('stable'), previous.body);
    harness.npm.seed(RUNTIME_PACKAGE, PREVIOUS_RUNTIME_VERSION, 'a'.repeat(64), { latest: PREVIOUS_RUNTIME_VERSION });

    const next = harness.stableNext;
    const plan = buildStablePromotionPlan({
      promotionId: 'promo-e2e',
      candidate: {
        receiptId: canaryReceiptId,
        releaseId: harness.bundle.candidateId,
        bundleSha256: harness.bundle.bundleSha256,
        indexSha256: harness.bundle.indexSha256,
      },
      previous: {
        stablePointerSha256: previous.sha256,
        releaseId: PREVIOUS_RELEASE_ID,
        npmTags: [{ package: RUNTIME_PACKAGE, tag: 'latest', version: PREVIOUS_RUNTIME_VERSION }],
      },
      next: {
        stablePointerSha256: next.sha256,
        releaseId: harness.bundle.releaseId,
        npmTags: [{ package: RUNTIME_PACKAGE, tag: 'latest', version: GOLDEN_PLATFORM_VERSION }],
      },
      observation: { durationSeconds: 3600, minimumSamples: 1, triggers: ['failed-clean-install'] },
    });

    const fakes = createFakeAdapters([{ id: 's1', observedAt: AT, trigger: null, severity: 'info' }]);
    const promotionCtx: PromotionSagaContext = {
      receiptStore: harness.receiptStore,
      leaseStore: new InMemoryLeaseStore(),
      journalStore: new InMemoryJournalStore(),
      activation: new CiActivationAdapter({
        fetcher: new LocalBundleFetcher(),
        npm: harness.npm,
        assets: harness.assets,
        cas: harness.cas,
        ciRunId: 'ci-run-e2e-promote',
        now: () => AT,
      }),
      observation: fakes.observation,
      actor: ACTOR,
      now: () => AT,
      bundleUriFor: () => `file://${harness.bundleDir}`,
    };

    const gate = await advanceStablePromotion({ ...promotionCtx, plan, candidateReceiptId: canaryReceiptId });
    expect(gate.awaitingApproval).toBe(true);
    await applyApproval(harness.receiptStore, buildApproval({
      receiptId: gate.receipt.receiptId,
      decision: 'approved',
      subject: { operation: 'promotion', promotionPlanSha256: stablePromotionPlanSha256(plan) },
      actor: ACTOR,
      at: AT,
    }), gate.receipt);

    const done = await advanceStablePromotion({ ...promotionCtx, plan, receiptId: gate.receipt.receiptId });

    expect(done.state).toBe('completed');
    expect(await livePointer(harness.cas, 'stable')).toBe(next.sha256);

    // §3D step 7 / §5.1: promotion moved a pointer and an alias, and produced no
    // new package version, no new tarball, no new binary asset — and it did not
    // disturb the canary pointer either.
    expect(harness.npm.published).toHaveLength(publishesAfterCanary);
    expect(harness.assets.uploads).toHaveLength(assetsAfterCanary);
    expect(await livePointer(harness.cas, 'canary')).toBe(canaryPointerSha);

    // §3D step 8: one identity across both halves. This is the assertion neither
    // saga's own test suite can make, because neither of them runs both halves.
    const canaryReceipt = await harness.receiptStore.read(canaryReceiptId) as ReleaseReceipt;
    expect({
      candidateId: canaryReceipt.candidateId,
      bundleSha256: canaryReceipt.bundleSha256,
      indexSha256: canaryReceipt.indexSha256,
    }).toEqual({
      candidateId: harness.bundle.candidateId,
      bundleSha256: harness.bundle.bundleSha256,
      indexSha256: harness.bundle.indexSha256,
    });
    expect(plan.candidate.bundleSha256).toBe(canaryReceipt.bundleSha256);
    expect(plan.candidate.indexSha256).toBe(canaryReceipt.indexSha256);
  });
});

// ── E2E-03: experimental is a contract, not a route ─────────────────────────

describe('E2E-03 a target the cutover does not implement', () => {
  it('refuses to point a channel at bytes no approval covered', async () => {
    // Decision S0.3d: `experimental` exists in the contract and has no
    // executable branch. The candidate saga can only reach `commit-channel` for
    // canary, so the reachable statement of the same rule is at the adapter: an
    // experimental commit finds no sealed `pointers/experimental.json` in a
    // bundle that never sealed one, and refuses rather than inventing one.
    const harness = candidateHarness();
    const receiptId = await approvedCandidate(harness);
    await advanceCandidateRelease({ ...harness.ctx, receiptId });

    const request = buildDeliveryRequest({
      receiptId,
      candidateId: harness.bundle.candidateId,
      bundleUri: `file://${harness.bundleDir}`,
      bundleSha256: harness.bundle.bundleSha256,
      stepId: 'activate-experimental',
      operation: 'commit-channel',
      targetChannel: 'experimental',
    });

    await expect(harness.ctx.activation.commitChannel(request)).rejects.toMatchObject({ retryable: false });
    // And no experimental pointer came into existence as a side effect.
    expect(await livePointer(harness.cas, 'experimental')).toBeNull();
  });
});

// ── E2E-04: the same delivery, twice ────────────────────────────────────────

describe('E2E-04 duplicate delivery', () => {
  it('re-publishing the identical bundle reuses the versions instead of conflicting', async () => {
    const harness = candidateHarness();
    const receiptId = await approvedCandidate(harness);
    await advanceCandidateRelease({ ...harness.ctx, receiptId });

    const publishesAfterFirst = harness.npm.published.length;
    const pointerWritesAfterFirst = harness.cas.writes.filter(
      w => w.key === channelPointerKey('canary'),
    ).length;

    // Exactly the request the saga issued, issued again — a retried CI run whose
    // first attempt's acknowledgement was lost.
    const replay = buildDeliveryRequest({
      receiptId,
      candidateId: harness.bundle.candidateId,
      bundleUri: `file://${harness.bundleDir}`,
      bundleSha256: harness.bundle.bundleSha256,
      stepId: 'publish-artifacts',
      operation: 'publish-artifacts',
    });
    const evidence = await harness.ctx.delivery.publishArtifacts(replay);

    // Same bytes already at the same version: reuse, not a hard conflict, and
    // not a second publish.
    expect(evidence.bundleSha256).toBe(harness.bundle.bundleSha256);
    expect(harness.npm.published).toHaveLength(publishesAfterFirst);

    // The pointer commit is idempotent for the same reason: the CAS write is a
    // no-op when the stored bytes already digest to what is being written.
    const commitReplay = buildDeliveryRequest({
      receiptId,
      candidateId: harness.bundle.candidateId,
      bundleUri: `file://${harness.bundleDir}`,
      bundleSha256: harness.bundle.bundleSha256,
      stepId: 'activate-canary',
      operation: 'commit-channel',
      targetChannel: 'canary',
    });
    await harness.ctx.activation.commitChannel(commitReplay);
    expect(harness.cas.writes.filter(w => w.key === channelPointerKey('canary')))
      .toHaveLength(pointerWritesAfterFirst);
    expect(await livePointer(harness.cas, 'canary')).toBe(harness.bundle.pointer.sha256);
  });
});

// ── E2E-05: bytes that are not the approved bytes ───────────────────────────

describe('E2E-05 an altered bundle', () => {
  it('is refused before any of its content is read', async () => {
    // The tamper edits one tarball *after* sealing, so the bundle's own manifest
    // still claims the sealed digest. Nothing about the request looks wrong; the
    // only thing that can catch this is the digest check over the real bytes.
    const harness = candidateHarness({
      tamper: dir => {
        const tarball = join(dir, 'npm', 'kb-labs-core-runtime.tgz');
        writeFileSync(tarball, `${readFileSync(tarball, 'utf8')}tampered`);
      },
    });
    const receiptId = await approvedCandidate(harness);

    const outcome = await advanceCandidateRelease({ ...harness.ctx, receiptId });

    // A wrong-bytes delivery is not a flaky call: the version burns and nothing
    // is published.
    expect(outcome.state).toBe('rejected');
    // Caught by the sealed-bundle check at the front of delivery, not by npm
    // rejecting something later — the tamper never reached a transport.
    expect(outcome.receipt.transitions.at(-1)!.reason ?? '')
      .toMatch(/publish-artifacts failed: sealed bundle/);
    expect(harness.npm.published).toHaveLength(0);
    expect(harness.assets.uploads).toHaveLength(0);
    expect(await livePointer(harness.cas, 'canary')).toBeNull();
  });
});

// ── E2E-06: evidence that answers a different question ──────────────────────

describe('E2E-06 mismatched evidence', () => {
  it('is rejected rather than folded into the receipt', async () => {
    const harness = candidateHarness();

    // An activation adapter whose evidence is well-formed and belongs to another
    // candidate. This is the shape a mis-correlated CI run produces — the exact
    // failure the deleted timestamp-based dispatch polling could not detect.
    class MisattributingActivation extends CiActivationAdapter {
      override async commitChannel(request: Parameters<CiActivationAdapter['commitChannel']>[0]) {
        const evidence = await super.commitChannel(request);
        return { ...evidence, candidateId: 'platform-9.9.9-someone-elses' };
      }
    }
    const ctx: CandidateSagaContext = {
      ...harness.ctx,
      activation: new MisattributingActivation({
        fetcher: new LocalBundleFetcher(),
        npm: harness.npm,
        assets: harness.assets,
        cas: harness.cas,
        ciRunId: 'ci-run-e2e',
        now: () => AT,
      }),
    };

    const receiptId = await approvedCandidate({ ...harness, ctx });
    const outcome = await advanceCandidateRelease({ ...ctx, receiptId });

    expect(outcome.state).toBe('rejected');
    const reason = outcome.receipt.transitions.at(-1)!.reason ?? '';
    expect(reason).toContain('candidateId');
    // The receipt never recorded a `canary-active` it could not substantiate.
    expect(outcome.receipt.transitions.map(entry => entry.to)).not.toContain('canary-active');
  });
});

// ── E2E-07: the process dies mid-flight ─────────────────────────────────────

describe('E2E-07 an interrupted workflow', () => {
  it('parks a transient delivery failure and resumes it on the same bundle, without a second approval', async () => {
    const harness = candidateHarness();

    // The public smoke times out for as many attempts as the retry budget
    // allows. A timeout is infrastructure, not a verdict on the code, so the
    // version must survive it — that is execution plan item 7's whole point.
    let smokeAttempts = 0;
    const flakySmoke: SmokeRunner = {
      async run(input) {
        smokeAttempts += 1;
        if (smokeAttempts <= 3) { return { ok: false, retryable: true, detail: 'registry timeout' }; }
        return passingSmoke().run(input);
      },
    };
    const ctx: CandidateSagaContext = {
      ...harness.ctx,
      smoke: new CiSmokeAdapter({ runner: flakySmoke, ciRunId: 'ci-run-e2e', now: () => AT }),
    };

    const receiptId = await approvedCandidate({ ...harness, ctx });
    const parked = await advanceCandidateRelease({ ...ctx, receiptId });

    expect(parked.state).toBe('needs-attention');
    // The artifacts are already public — that is precisely why re-running the
    // build would be the wrong recovery.
    expect(harness.npm.published.length).toBeGreaterThan(0);

    // A resume is an ordinary new invocation over the same receipt. No approval
    // is asked for a second time, and nothing is rebuilt.
    const resumed = await advanceCandidateRelease({ ...ctx, receiptId });

    expect(resumed.state).toBe('completed');
    expect(resumed.awaitingApproval).toBe(false);
    expect(harness.pipeline.countOf('seal')).toBe(1);
    expect(harness.pipeline.countOf('package')).toBe(1);
    // The same bytes were activated as the ones the single approval covered.
    expect(await livePointer(harness.cas, 'canary')).toBe(harness.bundle.pointer.sha256);
    expect(resumed.receipt.bundleSha256).toBe(harness.bundle.bundleSha256);
  });
});
