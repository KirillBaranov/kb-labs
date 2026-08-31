/**
 * PR 6 DoD (execution plan): "Delivery test exercises duplicate, mismatch,
 * partial delivery, propagation-delay, CAS drift, crash between tag writes,
 * pointer-first compensation and compensation-retry cases."
 *
 * This file covers the adapter-level half of that list — everything a single
 * `Ci*Adapter` call can be held responsible for. The saga-level half (crash
 * between tag writes, pointer-first compensation, compensation retry) is in
 * `control-plane-delivery-integration.test.ts`, because those are statements
 * about an ordering across several calls and cannot be asserted against one.
 *
 * Every case runs against a *sealed* bundle that would pass PR 2's verifier, not
 * a hand-built directory: delivery's first two gates are the externally supplied
 * digest and that verifier, so a fixture that could not clear them would leave
 * the interesting code unreached.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseControlDiagnosticCode,
  type DeliveryEvidence,
  type ReleaseDeliveryRequest,
} from '@kb-labs/release-manager-contracts';

import {
  CiActivationAdapter,
  CiDeliveryAdapter,
  CiSmokeAdapter,
  GhReleaseAssetStore,
  InMemoryCasStore,
  InMemoryNpmRegistry,
  InMemoryReleaseAssetStore,
  LocalBundleFetcher,
  ReleaseAdapterError,
  ShellNpmRegistry,
  assertNotChannelDistTag,
  buildDeliveryRequest,
  candidateDistTag,
  channelPointerKey,
  isRetryable,
  readSealedPointer,
  sha256Of,
  transientFailure,
  type CommandResultShape,
  type CommandRunner,
  type SmokeRunner,
} from '../control-plane/index.js';
import {
  DELIVERY_PACKAGES,
  buildDeliveryBundle,
  sealedPointer,
  type DeliveryBundle,
  type DeliveryBundleOptions,
} from './fixtures/delivery-bundle.js';

const RECEIPT = 'rcpt-delivery-1';
const RUN = 'run-1';
const AT = '2026-08-31T09:00:00Z';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-delivery-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

interface Harness {
  bundle: DeliveryBundle;
  dir: string;
  npm: InMemoryNpmRegistry;
  assets: InMemoryReleaseAssetStore;
  cas: InMemoryCasStore;
  emitted: DeliveryEvidence[];
  options: {
    fetcher: LocalBundleFetcher;
    npm: InMemoryNpmRegistry;
    assets: InMemoryReleaseAssetStore;
    cas: InMemoryCasStore;
    ciRunId: string;
    emit: (evidence: DeliveryEvidence) => void;
    now: () => string;
  };
}

function harness(options: DeliveryBundleOptions = {}): Harness {
  const dir = tempDir();
  const bundle = buildDeliveryBundle(dir, options);
  const npm = new InMemoryNpmRegistry();
  const assets = new InMemoryReleaseAssetStore();
  const cas = new InMemoryCasStore();
  const emitted: DeliveryEvidence[] = [];
  return {
    bundle, dir, npm, assets, cas, emitted,
    options: {
      fetcher: new LocalBundleFetcher(),
      npm, assets, cas,
      ciRunId: RUN,
      emit: evidence => { emitted.push(evidence); },
      now: () => AT,
    },
  };
}

function publishRequest(h: Harness, overrides: Partial<{ bundleSha256: string }> = {}): ReleaseDeliveryRequest {
  return buildDeliveryRequest({
    receiptId: RECEIPT,
    candidateId: h.bundle.candidateId,
    bundleUri: `file://${h.dir}`,
    bundleSha256: overrides.bundleSha256 ?? h.bundle.bundleSha256,
    stepId: 'publish-artifacts',
    operation: 'publish-artifacts',
  });
}

/** Digest of a packaged tarball, as the fixture wrote it. */
function tarballSha256(h: Harness, tarball: string): string {
  return sha256Of(readFileSync(join(h.dir, tarball)));
}

// ── gate 1: the externally supplied digest ───────────────────────────────────

describe('DEL-01 delivery request identity gates', () => {
  it('refuses a bundle whose digest is not the one the request expects, before publishing anything', async () => {
    const h = harness();
    const request = publishRequest(h, { bundleSha256: 'f'.repeat(64) });

    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(request)).rejects.toMatchObject({
      code: ReleaseControlDiagnosticCode.EvidenceMismatch,
      retryable: false,
    });
    expect(h.npm.published).toEqual([]);
    expect(h.assets.uploads).toEqual([]);
  });

  it('refuses a bundle that belongs to a different candidate identity', async () => {
    const h = harness();
    const request = buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: 'platform-9.9.9-a',
      bundleUri: `file://${h.dir}`,
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'publish-artifacts',
      operation: 'publish-artifacts',
    });

    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(request))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.EvidenceMismatch });
    expect(h.npm.published).toEqual([]);
  });

  it('refuses to publish immutable artifacts under a target channel', async () => {
    const h = harness();
    const request = buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleUri: `file://${h.dir}`,
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'publish-artifacts',
      operation: 'publish-artifacts',
      targetChannel: 'stable',
    });

    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(request))
      .rejects.toThrow(/must not name a target channel/);
  });

  it('reports an unreadable bundle locator as transient, not as a bad candidate', async () => {
    const h = harness();
    const request = buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleUri: 'file:///nonexistent/kb-labs-bundle',
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'publish-artifacts',
      operation: 'publish-artifacts',
    });

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(request).catch((e: unknown) => e);
    expect(isRetryable(error)).toBe(true);
  });

  it('refuses a bundle with no packaging record', async () => {
    const h = harness({ withoutPackaging: true });
    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h)))
      .rejects.toThrow(/has no packaging\.json/);
  });
});

// ── idempotent immutable publication ─────────────────────────────────────────

describe('DEL-02 idempotent publication', () => {
  it('publishes every package and asset once, under a non-channel candidate dist-tag', async () => {
    const h = harness();

    const evidence = await new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h));

    const tag = candidateDistTag(h.bundle.candidateId);
    expect(tag).toBe(`candidate-${h.bundle.candidateId}`);
    expect(h.npm.published.map(entry => `${entry.name}@${entry.version}`)).toEqual(
      DELIVERY_PACKAGES.map(pkg => `${pkg.name}@${pkg.version}`),
    );
    expect(new Set(h.npm.published.map(entry => entry.tag))).toEqual(new Set([tag]));
    // Two launcher binaries plus the sealed release index.
    expect(h.assets.uploads.map(upload => upload.name).sort()).toEqual([
      'kb-create-darwin-arm64', 'kb-create-linux-amd64', 'release-index.json',
    ]);
    expect(evidence.result).toBe('succeeded');
    expect(evidence.bundleSha256).toBe(h.bundle.bundleSha256);
    expect(evidence.observedDistTags).toHaveLength(DELIVERY_PACKAGES.length);
  });

  it('a replayed delivery request reuses everything instead of republishing it', async () => {
    const h = harness();
    const request = publishRequest(h);
    const adapter = new CiDeliveryAdapter(h.options);

    const first = await adapter.publishArtifacts(request);
    h.emitted.length = 0;
    const second = await adapter.publishArtifacts(request);

    // Same identity, same bytes: a success, not a conflict, and no second write.
    expect(h.npm.published).toHaveLength(DELIVERY_PACKAGES.length);
    expect(h.assets.uploads).toHaveLength(3);
    // A replay mutates nothing, so it emits no per-mutation evidence.
    expect(h.emitted).toEqual([]);
    expect(second.artifacts).toEqual(first.artifacts);
    expect(second.observedDistTags).toEqual(first.observedDistTags);
  });

  it('a different tarball at an already-published version is a hard conflict, never an overwrite', async () => {
    const h = harness();
    const [pkg] = DELIVERY_PACKAGES;
    h.npm.seed(pkg!.name, pkg!.version, 'a'.repeat(64));

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h))
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReleaseAdapterError);
    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryRejected, retryable: false });
    expect((error as Error).message).toMatch(/an immutable version is never overwritten/);
    expect(h.npm.published).toEqual([]);
  });

  it('a different asset at an already-published name is a hard conflict, never a clobber', async () => {
    const h = harness();
    h.assets.seed(h.bundle.releaseId, 'kb-create-linux-amd64', Buffer.from('somebody-elses-binary'));

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h))
      .catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryRejected, retryable: false });
    expect((error as Error).message).toMatch(/immutable assets are never clobbered/);
    expect(h.assets.uploads).toEqual([]);
  });

  it('refuses to decide reuse-vs-conflict when the published digest cannot be read', async () => {
    const h = harness();
    const [pkg] = DELIVERY_PACKAGES;
    // `''` is the transport saying *unknown*, and there is no `tarballSha256`
    // to resolve it — guessing either way would be a wrong publish.
    h.npm.seed(pkg!.name, pkg!.version, '');

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h))
      .catch((thrown: unknown) => thrown);
    expect(isRetryable(error)).toBe(true);
    expect((error as Error).message).toMatch(/refusing to decide between reuse and conflict/);
    expect(h.npm.published).toEqual([]);
  });

  it('reads back what it published and rejects a store serving different bytes', async () => {
    const h = harness();
    await new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h));
    h.assets.corrupt(h.bundle.releaseId, 'release-index.json', Buffer.from('not-the-index'));

    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h)))
      .rejects.toThrow(/serves [a-f0-9]{64}, expected/);
  });

  it('refuses when publication would leave a channel dist-tag resolving to the candidate', async () => {
    const h = harness();
    const [pkg] = DELIVERY_PACKAGES;
    h.npm.seed(pkg!.name, pkg!.version, tarballSha256(h, pkg!.tarball), { latest: pkg!.version });

    await expect(new CiDeliveryAdapter(h.options).publishArtifacts(publishRequest(h)))
      .rejects.toThrow(/channel visibility belongs to the pointer document/);
  });

  it('has no verb for publishing under a channel dist-tag at all', () => {
    for (const tag of ['latest', 'stable', 'canary', 'experimental']) {
      expect(() => assertNotChannelDistTag(tag)).toThrow(/refusing to publish under the channel dist-tag/);
    }
    expect(() => assertNotChannelDistTag(candidateDistTag('platform-2.119.0-a'))).not.toThrow();
    expect(() => candidateDistTag('---')).toThrow(/no usable dist-tag/);
  });
});

// ── partial delivery ─────────────────────────────────────────────────────────

describe('DEL-03 partial delivery leaves resumable evidence', () => {
  it('records the npm publishes that landed before an asset upload failed, and does not redo them', async () => {
    const h = harness();
    h.assets.failNext(
      `upload:${h.bundle.releaseId}/kb-create-linux-amd64`,
      () => { throw transientFailure('connection reset uploading the launcher'); },
    );
    const request = publishRequest(h);

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(request).catch((e: unknown) => e);
    expect(isRetryable(error)).toBe(true);

    // §6A.5: evidence after every mutation, so a resumed Workflow knows what
    // already landed rather than having to infer it.
    expect(h.emitted).toHaveLength(DELIVERY_PACKAGES.length);
    expect(h.emitted.flatMap(entry => entry.observedDistTags.map(tag => tag.package)))
      .toEqual(DELIVERY_PACKAGES.map(pkg => pkg.name));
    expect(h.emitted.every(entry => entry.receiptId === RECEIPT && entry.ciRunId === RUN)).toBe(true);
    expect(h.npm.published).toHaveLength(DELIVERY_PACKAGES.length);
    expect(h.assets.uploads).toEqual([]);

    // The resumed attempt completes the remaining work only.
    h.emitted.length = 0;
    const resumed = await new CiDeliveryAdapter(h.options).publishArtifacts(request);

    expect(h.npm.published).toHaveLength(DELIVERY_PACKAGES.length);
    expect(h.assets.uploads).toHaveLength(3);
    expect(h.emitted.every(entry => entry.artifacts.length > 0)).toBe(true);
    expect(resumed.result).toBe('succeeded');
  });
});

// ── propagation delay ────────────────────────────────────────────────────────

describe('DEL-04 propagation delay is transient, not a burned candidate', () => {
  it('classifies a registry that has not yet served a published version as retryable', async () => {
    const h = harness();
    const last = DELIVERY_PACKAGES[DELIVERY_PACKAGES.length - 1]!;
    // The write is accepted, but the next two reads still show the old world.
    h.npm.delayPropagation(last.name, 2);
    const request = publishRequest(h);

    const error = await new CiDeliveryAdapter(h.options).publishArtifacts(request).catch((e: unknown) => e);

    expect(isRetryable(error)).toBe(true);
    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryTransient });
    expect((error as Error).message).toMatch(/is not yet visible on the registry after publication/);
    // The version was really published — burning it here is exactly the mistake.
    expect(h.npm.published).toHaveLength(DELIVERY_PACKAGES.length);
  });

  it('converges on the retry inside the bounded window without republishing', async () => {
    const h = harness();
    const last = DELIVERY_PACKAGES[DELIVERY_PACKAGES.length - 1]!;
    h.npm.delayPropagation(last.name, 2);
    const request = publishRequest(h);
    const adapter = new CiDeliveryAdapter(h.options);

    await expect(adapter.publishArtifacts(request)).rejects.toThrow(/not yet visible/);
    const settled = await adapter.publishArtifacts(request);

    expect(settled.result).toBe('succeeded');
    expect(h.npm.published).toHaveLength(DELIVERY_PACKAGES.length);
  });

  it('treats an unreadable public pointer as transient and a wrong one as terminal', async () => {
    const h = harness();
    const activation = new CiActivationAdapter(h.options);
    const probe = {
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleSha256: h.bundle.bundleSha256,
      channel: 'stable',
      expectedReleaseId: h.bundle.releaseId,
    };

    // Not yet propagated.
    const stale = await activation.probePublic(probe).catch((e: unknown) => e);
    expect(isRetryable(stale)).toBe(true);

    // Propagated, but resolving to somebody else's release: drift, not a flake.
    h.cas.seed(channelPointerKey('stable'), sealedPointer('stable', 'platform-9.9.9').body);
    const drifted = await activation.probePublic(probe).catch((e: unknown) => e);
    expect(isRetryable(drifted)).toBe(false);

    h.cas.seed(channelPointerKey('stable'), h.bundle.pointer.body);
    const observed = await activation.probePublic(probe);
    expect(observed.artifacts[0]!.sha256).toBe(h.bundle.pointer.sha256);
  });
});

// ── the pointer: CAS drift on activation ─────────────────────────────────────

describe('DEL-05 channel pointer activation', () => {
  function commitRequest(h: Harness, overrides: {
    operation?: 'commit-channel' | 'compensate-channel';
    expectedPreviousPointerSha256?: string | null;
    pointerPlanSha256?: string;
  } = {}): ReleaseDeliveryRequest {
    return buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleUri: `file://${h.dir}`,
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'commit-stable-pointer',
      operation: overrides.operation ?? 'commit-channel',
      targetChannel: 'stable',
      ...(overrides.expectedPreviousPointerSha256 !== undefined
        ? { expectedPreviousPointerSha256: overrides.expectedPreviousPointerSha256 }
        : {}),
      ...(overrides.pointerPlanSha256 ? { pointerPlanSha256: overrides.pointerPlanSha256 } : {}),
    });
  }

  it('stages under a key no launcher resolves, leaving the public pointer untouched', async () => {
    const h = harness();
    const request = buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleUri: `file://${h.dir}`,
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'stage-stable',
      operation: 'stage-channel',
      targetChannel: 'stable',
    });

    const evidence = await new CiActivationAdapter(h.options).stageChannel(request);

    expect(h.cas.writes.map(write => write.key)).toEqual([`staging/stable/${h.bundle.candidateId}.json`]);
    expect(await h.cas.read(channelPointerKey('stable'))).toBeNull();
    expect(evidence.operation).toBe('stage-channel');
  });

  it('commits the sealed pointer when the plan\'s previous digest is what is live', async () => {
    const h = harness();
    const previous = sealedPointer('stable', 'platform-2.118.0');
    h.cas.seed(channelPointerKey('stable'), previous.body);

    const evidence = await new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      expectedPreviousPointerSha256: previous.sha256,
      pointerPlanSha256: h.bundle.pointer.sha256,
    }));

    expect(h.cas.writes.map(write => write.key)).toEqual([channelPointerKey('stable')]);
    expect((await h.cas.read(channelPointerKey('stable')))!.body).toBe(h.bundle.pointer.body);
    expect(evidence.artifacts[0]!.sha256).toBe(h.bundle.pointer.sha256);
  });

  it('CAS drift: refuses when the live pointer is not the one the plan was approved against', async () => {
    const h = harness();
    const previous = sealedPointer('stable', 'platform-2.118.0');
    const foreign = sealedPointer('stable', 'platform-2.118.5');
    h.cas.seed(channelPointerKey('stable'), foreign.body);

    const error = await new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      expectedPreviousPointerSha256: previous.sha256,
      pointerPlanSha256: h.bundle.pointer.sha256,
    })).catch((thrown: unknown) => thrown);

    // A *named* failure, distinct from "the store is down": a saga has to be
    // able to tell "somebody else moved this" from "retry in a moment".
    expect(error).toMatchObject({
      code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch,
      retryable: false,
    });
    expect(h.cas.writes).toEqual([]);
    expect((await h.cas.read(channelPointerKey('stable')))!.body).toBe(foreign.body);
  });

  it('a store outage during the pointer write is a different, retryable failure', async () => {
    const h = harness();
    const previous = sealedPointer('stable', 'platform-2.118.0');
    h.cas.seed(channelPointerKey('stable'), previous.body);
    h.cas.failNext(channelPointerKey('stable'), () => { throw transientFailure('pointer endpoint 503'); });

    const error = await new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      expectedPreviousPointerSha256: previous.sha256,
      pointerPlanSha256: h.bundle.pointer.sha256,
    })).catch((thrown: unknown) => thrown);

    expect(isRetryable(error)).toBe(true);
    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryTransient });
  });

  it('replaying a landed commit is idempotent rather than a precondition failure', async () => {
    const h = harness();
    const previous = sealedPointer('stable', 'platform-2.118.0');
    h.cas.seed(channelPointerKey('stable'), previous.body);
    const request = commitRequest(h, {
      expectedPreviousPointerSha256: previous.sha256,
      pointerPlanSha256: h.bundle.pointer.sha256,
    });
    const activation = new CiActivationAdapter(h.options);

    await activation.commitChannel(request);
    // The crash-between-write-and-acknowledgement replay: the precondition is
    // now stale, but the desired state is already the live one.
    const replay = await activation.commitChannel(request);

    expect(h.cas.writes).toHaveLength(1);
    expect(replay.artifacts[0]!.sha256).toBe(h.bundle.pointer.sha256);
  });

  it('refuses a sealed pointer whose digest is not the one the plan authorises', async () => {
    const h = harness();
    await expect(new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      expectedPreviousPointerSha256: null,
      pointerPlanSha256: 'c'.repeat(64),
    }))).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch });
    expect(h.cas.writes).toEqual([]);
  });

  it('refuses to activate a bundle that ships no sealed pointer', async () => {
    const h = harness({ withoutPointer: true });
    await expect(new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      expectedPreviousPointerSha256: null,
    }))).rejects.toThrow(/CI publishes pointer bytes, it never renders them/);
  });

  it('refuses a compensation that cannot name the pointer bytes it restores', async () => {
    const h = harness();
    h.cas.seed(channelPointerKey('stable'), h.bundle.pointer.body);

    // No `pointerPlanSha256` — the fallback would republish the very pointer the
    // compensation is undoing and report success.
    await expect(new CiActivationAdapter(h.options).commitChannel(commitRequest(h, {
      operation: 'compensate-channel',
      expectedPreviousPointerSha256: h.bundle.pointer.sha256,
    }))).rejects.toThrow(/requires the digest of the sealed pointer bytes to restore/);
    expect(h.cas.writes).toEqual([]);
  });

  it('refuses operations that are not a pointer commit at all', async () => {
    const h = harness();
    await expect(new CiActivationAdapter(h.options).commitChannel(buildDeliveryRequest({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleUri: `file://${h.dir}`,
      bundleSha256: h.bundle.bundleSha256,
      stepId: 'x',
      operation: 'stage-channel',
      targetChannel: 'stable',
    }))).rejects.toThrow(/commitChannel refuses operation stage-channel/);
  });

  it('a failed npm alias move is degraded evidence, never a thrown failure', async () => {
    const h = harness();
    h.npm.failNext('tag:@kb-labs/sdk@latest', () => { throw transientFailure('registry 500'); });

    const evidence = await new CiActivationAdapter(h.options).moveAlias({
      receiptId: RECEIPT,
      candidateId: h.bundle.candidateId,
      bundleSha256: h.bundle.bundleSha256,
      package: '@kb-labs/sdk',
      tag: 'latest',
      version: '1.4.0',
    });

    expect(evidence.result).toBe('degraded');
    expect(h.npm.tagMoves).toEqual([]);
  });
});

// ── the sealed-pointer lookup ────────────────────────────────────────────────

describe('DEL-06 sealed pointer selection', () => {
  it('selects the digest-addressed pointer the approval authorises, not the bundle\'s own', () => {
    const previous = sealedPointer('stable', 'platform-2.118.0');
    const dir = tempDir();
    const bundle = buildDeliveryBundle(dir, { alsoSeal: [previous] });

    expect(readSealedPointer(dir, 'stable').sha256).toBe(bundle.pointer.sha256);
    expect(readSealedPointer(dir, 'stable', previous.sha256).body).toBe(previous.body);
    expect(readSealedPointer(dir, 'stable', bundle.pointer.sha256).body).toBe(bundle.pointer.body);
  });

  it('refuses when no sealed pointer in the bundle carries the authorised digest', () => {
    const dir = tempDir();
    buildDeliveryBundle(dir);
    expect(() => readSealedPointer(dir, 'stable', 'd'.repeat(64)))
      .toThrow(/no sealed stable pointer in this bundle digests to/);
  });
});

// ── the launcher smoke ───────────────────────────────────────────────────────

describe('DEL-07 smoke failure classification', () => {
  const input = {
    receiptId: RECEIPT,
    candidateId: 'platform-2.119.0-a',
    releaseId: 'platform-2.119.0',
    bundleSha256: 'a'.repeat(64),
  };
  const adapter = (runner: SmokeRunner): CiSmokeAdapter => new CiSmokeAdapter({ runner, ciRunId: RUN, now: () => AT });

  it('turns a functional smoke failure into a terminal rejection', async () => {
    const error = await adapter({ run: async () => ({ ok: false, detail: 'launcher exited 1' }) })
      .smokeExactVersion(input).catch((thrown: unknown) => thrown);
    expect(isRetryable(error)).toBe(false);
    expect((error as Error).message).toMatch(/launcher exited 1/);
  });

  it('keeps an infrastructure smoke failure retryable so the version survives', async () => {
    const error = await adapter({ run: async () => ({ ok: false, retryable: true, detail: 'runner lost the network' }) })
      .smokeExactVersion(input).catch((thrown: unknown) => thrown);
    expect(isRetryable(error)).toBe(true);
  });

  it('produces evidence bound to the exact version it smoked', async () => {
    const evidence = await adapter({ run: async () => ({ ok: true }) }).smokeExactVersion(input);
    expect(evidence).toMatchObject({
      receiptId: RECEIPT, candidateId: input.candidateId, bundleSha256: input.bundleSha256, result: 'succeeded',
    });
  });
});

// ── the shell transports ─────────────────────────────────────────────────────

describe('DEL-08 command-backed transports', () => {
  function recorder(reply: (args: readonly string[]) => CommandResultShape): {
    run: CommandRunner;
    calls: Array<{ command: string; args: readonly string[] }>;
  } {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    return {
      calls,
      run: (command, args) => { calls.push({ command, args }); return reply(args); },
    };
  }

  it('reads a missing npm package as absent and a network fault as retryable', async () => {
    const missing = recorder(() => ({ status: 1, stdout: '', stderr: 'npm ERR! code E404' }));
    expect(await new ShellNpmRegistry({ run: missing.run }).read('@kb-labs/nope')).toBeNull();

    const broken = recorder(() => ({ status: 1, stdout: '', stderr: 'ECONNRESET' }));
    const error = await new ShellNpmRegistry({ run: broken.run }).read('@kb-labs/sdk').catch((e: unknown) => e);
    expect(isRetryable(error)).toBe(true);
  });

  it('publishes without any force/clobber equivalent and refuses a channel dist-tag', async () => {
    const ok = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    const registry = new ShellNpmRegistry({ run: ok.run, registry: 'https://registry.invalid' });

    await registry.publish({
      name: '@kb-labs/sdk', version: '1.4.0', tag: 'candidate-platform-2.119.0-a',
      tarballPath: '/tmp/sdk.tgz', sha256: 'a'.repeat(64),
    });

    const args = ok.calls[0]!.args.join(' ');
    expect(args).toContain('publish /tmp/sdk.tgz --tag candidate-platform-2.119.0-a');
    expect(args).not.toMatch(/--force|--clobber|--overwrite/);
    expect(args).toContain('--registry https://registry.invalid');

    await expect(registry.publish({
      name: '@kb-labs/sdk', version: '1.4.0', tag: 'latest',
      tarballPath: '/tmp/sdk.tgz', sha256: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryRejected, retryable: false });
    // The refusal happened before the transport was reached.
    expect(ok.calls).toHaveLength(1);
  });

  it('reports a failed npm publish as retryable rather than burning the version', async () => {
    const failing = recorder(() => ({ status: 1, stdout: '', stderr: 'ETIMEDOUT' }));
    const error = await new ShellNpmRegistry({ run: failing.run }).publish({
      name: '@kb-labs/sdk', version: '1.4.0', tag: 'candidate-x', tarballPath: '/tmp/sdk.tgz', sha256: 'a'.repeat(64),
    }).catch((e: unknown) => e);
    expect(isRetryable(error)).toBe(true);
  });

  it('uploads release assets without --clobber and reads a missing release as absent', async () => {
    const ok = recorder(args => (args.includes('view')
      ? { status: 1, stdout: '', stderr: 'release not found' }
      : { status: 0, stdout: '', stderr: '' }));
    const store = new GhReleaseAssetStore({ repository: 'kb-labs/kb-labs', run: ok.run });

    expect(await store.read('platform-2.119.0')).toBeNull();
    const asset = await store.upload({
      tag: 'platform-2.119.0', name: 'kb-create-linux-amd64', path: '/tmp/kb-create', sha256: 'b'.repeat(64),
    });

    const uploadArgs = ok.calls[1]!.args.join(' ');
    expect(uploadArgs).toContain('release upload platform-2.119.0 /tmp/kb-create');
    expect(uploadArgs).not.toMatch(/--clobber|--force/);
    expect(asset.url).toContain('kb-labs/kb-labs/releases/download/platform-2.119.0/kb-create-linux-amd64');
  });
});
