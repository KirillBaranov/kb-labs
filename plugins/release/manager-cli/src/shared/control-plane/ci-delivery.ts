/**
 * The real delivery plane (cutover §6A.5, execution PR 6).
 *
 * PR 5 left `DeliveryAdapter`/`SmokeAdapter`/`ActivationAdapter` as fakes and
 * said the implementations that actually talk to npm, GitHub Releases and the
 * pointer endpoint were PR 6's job. This is that half. The interfaces are
 * unchanged — the saga cannot tell a real adapter from a fake one, which is the
 * property that lets a dry run and a live run be the same state machine.
 *
 * ## What CI is allowed to be
 *
 * §6A.5 lists CI's permitted steps: fetch a bundle, verify its expected digest,
 * publish exact files, verify what landed remotely, update the channel pointer
 * last, produce evidence. Everything that decides *what* to publish — versions,
 * channels, package membership, the index, the pointer bytes — happened in the
 * plugin before CI was called. So nothing here constructs a document. The
 * pointer and support-policy bytes are read from the sealed bundle and checked
 * against a digest the approval already covered; if they are absent, delivery
 * refuses rather than rendering them, because a CI that can author a pointer is
 * a CI that can publish an unapproved one.
 *
 * ## The order, and why each step is where it is
 *
 * 1. **External digest before internal contents.** The expected digest comes
 *    from outside the bundle (the receipt, via the delivery request). It is
 *    checked against the manifest *before* any file in the bundle is read, so a
 *    substituted-but-internally-consistent bundle is rejected before its bytes
 *    can influence anything. Only then does `verifyBundleDirectory` — PR 2's
 *    seven-rule verifier, not a second copy of hash checking — read the rest.
 * 2. **Read remote state before every publish.** §6A.5's idempotency rule:
 *    identical bytes at the same identity is a success with `reused: true`;
 *    different bytes at the same identity is a hard conflict. Neither is an
 *    overwrite, and there is no code path here that could become one.
 * 3. **Read back what was published.** A registry that accepts a write and
 *    serves something else is not a hypothetical, and it cannot be detected by
 *    trusting the write's own response.
 * 4. **The pointer last.** It is the only visibility surface a launcher
 *    resolves through, so until it moves nothing a user sees has changed —
 *    which is what makes every earlier step safely re-runnable.
 *
 * ## Evidence after every mutation, not at the end
 *
 * §6A.5: "CI обязан возвращать evidence после каждой mutation, чтобы Workflow
 * мог безопасно продолжить после crash." The adapter interface returns one
 * value per call, so per-mutation evidence goes to an `emit` sink as it
 * happens and the returned value is the aggregate. A crash between two npm
 * publishes therefore leaves a record of the first one, which is the whole
 * difference between a resumable partial delivery and an unknown one.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  DeliveryEvidenceSchema,
  ReleaseBundleSchema,
  ReleaseChannelPointerSchema,
  ReleaseControlDiagnosticCode,
  ReleaseDeliveryRequestSchema,
  canonicalSha256,
  type DeliveryEvidence,
  type ReleaseBundle,
  type ReleaseChannelPointer,
  type ReleaseDeliveryRequest,
} from '@kb-labs/release-manager-contracts';

import {
  ReleaseAdapterError,
  rejectingFailure,
  transientFailure,
  type ActivationAdapter,
  type DeliveryAdapter,
  type SmokeAdapter,
} from './adapters.js';
import {
  channelPointerKey,
  writeDocumentWithCas,
  type CasStore,
} from './cas-store.js';
import {
  candidateDistTag,
  sha256Of,
  type NpmRegistry,
  type ReleaseAssetStore,
} from './delivery-targets.js';
import { PackagingRecordSchema, type PackagingRecord } from '../bundle/package.js';
import { RELEASE_INDEX_FILE } from '../bundle/seal.js';
import { verifyBundleDirectory } from '../verify-bundle.js';

export const BUNDLE_MANIFEST = 'bundle.json';
export const PACKAGING_RECORD = 'packaging.json';
/** Where the plugin seals the pointer bytes CI is permitted to publish. */
export const SEALED_POINTER_DIR = 'pointers';
export const RELEASE_DESCRIPTOR_FILE = 'release.json';

/**
 * Materialises the bundle CI was handed a scoped read locator for.
 *
 * The backend is deliberately not part of the CI contract (execution §3.2: "backend
 * этого store — заменяемая implementation detail"). CI receives a URI and an
 * externally expected digest and nothing else.
 */
export interface BundleFetcher {
  fetch(input: { uri: string; candidateId: string }): Promise<{ dir: string }>;
}

/** `file:`/absolute-path locator, used by local rehearsals and the tests. */
export class LocalBundleFetcher implements BundleFetcher {
  async fetch(input: { uri: string; candidateId: string }): Promise<{ dir: string }> {
    const path = input.uri.startsWith('file://') ? new URL(input.uri).pathname : input.uri;
    if (!existsSync(path)) {
      throw transientFailure(`bundle locator ${input.uri} is not readable from this runner`);
    }
    return { dir: resolve(path) };
  }
}

export type DeliveryEvidenceSink = (evidence: DeliveryEvidence) => void | Promise<void>;

export interface CiDeliveryOptions {
  fetcher: BundleFetcher;
  npm: NpmRegistry;
  assets: ReleaseAssetStore;
  cas: CasStore;
  /**
   * Run correlation (§6A.5). Supplied by the caller and derived from
   * `receiptId`/`candidateId` — never from a branch name, and never discovered
   * by polling for the most recent run, which is what the deleted
   * `dispatch-release-*.mjs` scripts did.
   */
  ciRunId: string;
  /** Per-mutation evidence sink; the returned evidence is the aggregate. */
  emit?: DeliveryEvidenceSink;
  now?: () => string;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Digest of a mutable control-plane document, matching PR 4's sealing digest. */
export function channelPointerSha256(pointer: ReleaseChannelPointer): string {
  return canonicalSha256(pointer);
}

interface VerifiedBundle {
  dir: string;
  manifest: ReleaseBundle;
  packaging: PackagingRecord;
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw rejectingFailure(`unreadable bundle document ${path}: ${(error as Error).message}`);
  }
}

/**
 * Gate 1 — the externally supplied digest, checked against nothing but the
 * manifest.
 *
 * Separate from `verifyBundleDirectory` on purpose. That function answers "is
 * this bundle internally consistent?", which a maliciously *re-sealed* bundle
 * also passes. This one answers "is this the bundle the approval was granted
 * over?", and it must be answered first, because every later step reads bundle
 * contents and a wrong bundle's contents must never be read.
 */
export function assertExpectedBundleDigest(bundleDir: string, expectedBundleSha256: string): ReleaseBundle {
  const manifestPath = join(bundleDir, BUNDLE_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw rejectingFailure(`bundle at ${bundleDir} has no ${BUNDLE_MANIFEST}; it is not a sealed release bundle`);
  }
  const manifest = ReleaseBundleSchema.parse(readJsonFile(manifestPath));
  const recomputed = canonicalSha256({ ...manifest, bundleSha256: '' });
  if (recomputed !== manifest.bundleSha256) {
    throw rejectingFailure(
      `bundle manifest is not self-consistent: it claims ${manifest.bundleSha256} but digests to ${recomputed}`,
    );
  }
  if (manifest.bundleSha256 !== expectedBundleSha256) {
    throw new ReleaseAdapterError(
      `delivery was handed bundle ${manifest.bundleSha256} but the request expects ${expectedBundleSha256}. `
      + 'Refusing before any bundle content is read.',
      { retryable: false, code: ReleaseControlDiagnosticCode.EvidenceMismatch },
    );
  }
  return manifest;
}

/** Gate 1 then gate 2 — PR 2's verifier, never a reimplementation of it. */
export async function resolveVerifiedBundle(
  options: Pick<CiDeliveryOptions, 'fetcher'>,
  request: ReleaseDeliveryRequest,
): Promise<VerifiedBundle> {
  const { dir } = await options.fetcher.fetch({ uri: request.bundle.uri, candidateId: request.candidateId });
  const manifest = assertExpectedBundleDigest(dir, request.expectedBundleSha256);

  const report = verifyBundleDirectory(dir, request.expectedBundleSha256);
  if (!report.ok) {
    throw rejectingFailure(
      `sealed bundle failed verification in CI: ${report.diagnostics.map(d => `[rule ${d.rule}] ${d.code}: ${d.message}`).join('; ')}`,
    );
  }
  if (manifest.candidateId !== request.candidateId) {
    throw new ReleaseAdapterError(
      `bundle belongs to candidate ${manifest.candidateId}, request names ${request.candidateId}`,
      { retryable: false, code: ReleaseControlDiagnosticCode.EvidenceMismatch },
    );
  }

  const packagingPath = join(dir, PACKAGING_RECORD);
  if (!existsSync(packagingPath)) {
    throw rejectingFailure(`bundle at ${dir} has no ${PACKAGING_RECORD}; there is nothing to publish`);
  }
  const packaging = PackagingRecordSchema.parse(readJsonFile(packagingPath));
  return { dir, manifest, packaging };
}

/**
 * Reads the already-sealed pointer bytes for one channel out of the bundle.
 *
 * The refusal when no sealed file is present is the enforcement point for
 * §6A.5's "нельзя конструировать в CI байты pointer или descriptor". There is no
 * fallback that renders a pointer, so a bundle that did not ship one simply
 * cannot be activated — which is the correct outcome, because an unsealed
 * pointer was never covered by the approval.
 *
 * ## Why more than one sealed pointer per channel
 *
 * A promotion has two authorised pointer values, not one: the *next* pointer it
 * commits, and the *previous* pointer its compensation restores. Both are inside
 * the digest the operator signed (`plan.next` / `plan.previous`), and neither may
 * be rendered here. The channel's own next pointer lives at `<channel>.json`;
 * every other pointer the same approval authorises — in practice the
 * compensation target, which belongs to the release being rolled back *to* and
 * so is not this bundle's own — is sealed beside it, digest-addressed as
 * `<channel>.<sha256>.json`.
 *
 * Selecting between them by digest is still not authoring: every candidate file
 * was sealed by the plugin, and the digest that selects one comes from the
 * approved plan rather than from anything CI computed.
 */
export function readSealedPointer(bundleDir: string, channel: string, expectedSha256?: string): {
  pointer: ReleaseChannelPointer;
  body: string;
  sha256: string;
} {
  const names = [`${channel}.json`, ...(expectedSha256 ? [`${channel}.${expectedSha256}.json`] : [])];
  const found: Array<{ pointer: ReleaseChannelPointer; body: string; sha256: string; name: string }> = [];
  for (const name of names) {
    const path = join(bundleDir, SEALED_POINTER_DIR, name);
    if (!existsSync(path)) { continue; }
    const body = readFileSync(path, 'utf8');
    const pointer = ReleaseChannelPointerSchema.parse(JSON.parse(body));
    if (pointer.channel !== channel) {
      throw rejectingFailure(`sealed pointer at ${SEALED_POINTER_DIR}/${name} declares channel ${pointer.channel}`);
    }
    found.push({ pointer, body, sha256: channelPointerSha256(pointer), name });
  }

  const first = found[0];
  if (!first) {
    throw rejectingFailure(
      `the bundle carries no sealed ${channel} pointer at ${SEALED_POINTER_DIR}/${channel}.json. `
      + 'CI publishes pointer bytes, it never renders them — seal the pointer in the release plugin first.',
    );
  }
  if (!expectedSha256) {
    return { pointer: first.pointer, body: first.body, sha256: first.sha256 };
  }

  const match = found.find(entry => entry.sha256 === expectedSha256);
  if (!match) {
    throw new ReleaseAdapterError(
      `no sealed ${channel} pointer in this bundle digests to ${expectedSha256}, which is what the approved plan `
      + `authorises (found ${found.map(entry => `${entry.name}→${entry.sha256}`).join(', ')})`,
      { retryable: false, code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch },
    );
  }
  return { pointer: match.pointer, body: match.body, sha256: match.sha256 };
}

interface EvidenceInput {
  request: Pick<ReleaseDeliveryRequest, 'receiptId' | 'candidateId' | 'expectedBundleSha256' | 'operation' | 'targetChannel'>;
  ciRunId: string;
  observedAt: string;
  artifacts?: DeliveryEvidence['artifacts'];
  observedDistTags?: DeliveryEvidence['observedDistTags'];
  result?: DeliveryEvidence['result'];
}

function buildEvidence(input: EvidenceInput): DeliveryEvidence {
  return DeliveryEvidenceSchema.parse({
    schema: 'kb.delivery-evidence/1',
    receiptId: input.request.receiptId,
    candidateId: input.request.candidateId,
    bundleSha256: input.request.expectedBundleSha256,
    operation: input.request.operation,
    ...(input.request.targetChannel ? { targetChannel: input.request.targetChannel } : {}),
    ciRunId: input.ciRunId,
    observedAt: input.observedAt,
    artifacts: input.artifacts ?? [],
    observedDistTags: input.observedDistTags ?? [],
    result: input.result ?? 'succeeded',
    signature: null,
  });
}

/**
 * Publishes the immutable half of a release (§6A.5 ordering steps 1–6).
 *
 * Changes no channel pointer, by construction: this class is not given the
 * pointer key and never calls `writeDocumentWithCas`.
 */
export class CiDeliveryAdapter implements DeliveryAdapter {
  constructor(private readonly options: CiDeliveryOptions) {}

  private get now(): () => string {
    return this.options.now ?? nowIso;
  }

  private async emit(evidence: DeliveryEvidence): Promise<void> {
    await this.options.emit?.(evidence);
  }

  async publishArtifacts(rawRequest: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const request = ReleaseDeliveryRequestSchema.parse(rawRequest);
    if (request.operation !== 'publish-artifacts') {
      throw rejectingFailure(`publishArtifacts refuses operation ${request.operation}`);
    }
    if (request.targetChannel) {
      // §6A.5 step 6: "No mutable channel pointer changes in this operation."
      throw rejectingFailure('immutable publication must not name a target channel');
    }

    const bundle = await resolveVerifiedBundle(this.options, request);
    const tag = candidateDistTag(request.candidateId);
    const artifacts: DeliveryEvidence['artifacts'] = [];
    const observedDistTags: DeliveryEvidence['observedDistTags'] = [];

    // ── npm tarballs ──────────────────────────────────────────────────────
    for (const pkg of bundle.packaging.packages) {
      const tarballPath = join(bundle.dir, pkg.tarball);
      if (!existsSync(tarballPath)) {
        throw rejectingFailure(`bundle promises ${pkg.tarball} but the file is absent`);
      }
      const localSha256 = sha256Of(readFileSync(tarballPath));
      if (localSha256 !== pkg.sha256) {
        throw rejectingFailure(`tarball ${pkg.tarball} digests to ${localSha256}, manifest says ${pkg.sha256}`);
      }

      const remote = await this.options.npm.read(pkg.name);
      const existing = remote?.versions.find(entry => entry.version === pkg.version);
      // `''` means the transport could not report a digest cheaply. Resolving it
      // costs a download, and refusing to resolve it is not an option: `reused`
      // and "hard conflict" are opposite outcomes and this is the only fact that
      // separates them.
      const publishedSha256 = existing && existing.sha256 === ''
        ? await this.options.npm.tarballSha256?.(pkg.name, pkg.version) ?? null
        : existing?.sha256 ?? null;
      if (existing && publishedSha256 === null) {
        throw transientFailure(
          `${pkg.name}@${pkg.version} already exists but its published digest could not be read; `
          + 'refusing to decide between reuse and conflict without it',
        );
      }
      if (existing && publishedSha256 !== pkg.sha256) {
        // The hard conflict of §6A.5. Never an overwrite, and not retryable:
        // the identity is already spent on different bytes.
        throw new ReleaseAdapterError(
          `${pkg.name}@${pkg.version} is already published with digest ${publishedSha256}, `
          + `but this bundle carries ${pkg.sha256}. Refusing; an immutable version is never overwritten.`,
          { retryable: false, code: ReleaseControlDiagnosticCode.DeliveryRejected },
        );
      }
      if (!existing) {
        await this.options.npm.publish({
          name: pkg.name, version: pkg.version, tag, tarballPath, sha256: pkg.sha256,
        });
        await this.emit(buildEvidence({
          request,
          ciRunId: this.options.ciRunId,
          observedAt: this.now(),
          observedDistTags: [{ package: pkg.name, tag, version: pkg.version }],
        }));
      }
      observedDistTags.push({ package: pkg.name, tag, version: pkg.version });
    }

    // ── immutable assets: binaries, sealed index, exact descriptor ────────
    const assetTag = bundle.manifest.releaseId;
    const assetFiles: Array<{ name: string; path: string; sha256: string }> = [];
    for (const binary of bundle.packaging.binaries) {
      if (!binary.path) { continue; }
      const path = join(bundle.dir, binary.path);
      if (!existsSync(path)) {
        throw rejectingFailure(`bundle promises binary ${binary.path} but the file is absent`);
      }
      assetFiles.push({ name: binary.filename, path, sha256: binary.sha256 });
    }
    for (const name of [RELEASE_INDEX_FILE, RELEASE_DESCRIPTOR_FILE]) {
      const path = join(bundle.dir, name);
      if (!existsSync(path)) { continue; }
      assetFiles.push({ name, path, sha256: sha256Of(readFileSync(path)) });
    }

    if (assetFiles.length > 0) {
      const remoteAssets = await this.options.assets.read(assetTag);
      if (remoteAssets === null) {
        await this.options.assets.create({
          tag: assetTag,
          title: `KB Labs ${assetTag}`,
          notes: `Immutable release artifacts for candidate ${request.candidateId} (receipt ${request.receiptId}).`,
        });
      }
      const byName = new Map((remoteAssets ?? []).map(asset => [asset.name, asset]));
      for (const file of assetFiles) {
        const existing = byName.get(file.name);
        // GitHub does not report asset digests, so `''` means unknown and the
        // bytes have to be fetched before "already published" can be read as
        // either reuse or conflict.
        const publishedSha256 = existing
          ? (existing.sha256 || sha256Of(await this.options.assets.download({ tag: assetTag, name: file.name })))
          : null;
        if (existing && publishedSha256 !== file.sha256) {
          throw new ReleaseAdapterError(
            `asset ${assetTag}/${file.name} already exists with digest ${publishedSha256}, `
            + `this bundle carries ${file.sha256}. Refusing; immutable assets are never clobbered.`,
            { retryable: false, code: ReleaseControlDiagnosticCode.DeliveryRejected },
          );
        }
        const asset = existing ?? await this.options.assets.upload({
          tag: assetTag, name: file.name, path: file.path, sha256: file.sha256,
        });
        if (!existing) {
          await this.emit(buildEvidence({
            request,
            ciRunId: this.options.ciRunId,
            observedAt: this.now(),
            artifacts: [{ url: asset.url, sha256: file.sha256 }],
          }));
        }
        // The bundle's digest, not the store's report: the two have just been
        // proven equal, and only the former is guaranteed to be a real sha256.
        artifacts.push({ url: asset.url, sha256: file.sha256 });
      }

      // §6A.5 step 3 — read back and compare, including for reused assets: a
      // `reused` decision was made from the store's *metadata*, and metadata is
      // not the bytes a user will download.
      for (const file of assetFiles) {
        const bytes = await this.options.assets.download({ tag: assetTag, name: file.name });
        const served = sha256Of(bytes);
        if (served !== file.sha256) {
          throw rejectingFailure(
            `remote asset ${assetTag}/${file.name} serves ${served}, expected ${file.sha256}`,
          );
        }
      }
    }

    // ── §6A.5 step 5: exact versions present, channel tags untouched ──────
    for (const pkg of bundle.packaging.packages) {
      const remote = await this.options.npm.read(pkg.name);
      if (!remote || !remote.versions.some(entry => entry.version === pkg.version)) {
        // Not a rejection: a registry that has accepted a publish but not yet
        // serves it is the ordinary propagation delay, and burning a SemVer
        // over it is exactly the mistake PR 5 item 7 exists to prevent.
        throw transientFailure(
          `${pkg.name}@${pkg.version} is not yet visible on the registry after publication`,
        );
      }
      for (const channelTag of ['latest', 'stable', 'canary', 'experimental']) {
        if (remote.distTags[channelTag] === pkg.version) {
          throw rejectingFailure(
            `immutable publication moved the channel dist-tag ${pkg.name}@${channelTag} to ${pkg.version}; `
            + 'channel visibility belongs to the pointer document, not to this step',
          );
        }
      }
    }

    return buildEvidence({
      request,
      ciRunId: this.options.ciRunId,
      observedAt: this.now(),
      artifacts,
      observedDistTags,
    });
  }
}

/**
 * The launcher smoke over an exact, immutable version.
 *
 * The runner is injected because "install the published launcher and use it" is
 * inherently an out-of-process operation whose real form is a command on a CI
 * runner. Keeping it behind an interface is what lets the delivery tests assert
 * the *classification* of a smoke failure — functional failures reject the
 * candidate and burn its version, infrastructure failures do not — without a
 * network.
 */
export interface SmokeRunner {
  run(input: { receiptId: string; candidateId: string; releaseId: string; bundleSha256: string }):
  Promise<{ ok: boolean; retryable?: boolean; detail?: string }>;
}

export class CiSmokeAdapter implements SmokeAdapter {
  constructor(private readonly options: {
    runner: SmokeRunner;
    ciRunId: string;
    emit?: DeliveryEvidenceSink;
    now?: () => string;
  }) {}

  async smokeExactVersion(input: {
    receiptId: string;
    candidateId: string;
    releaseId: string;
    bundleSha256: string;
  }): Promise<DeliveryEvidence> {
    const result = await this.options.runner.run(input);
    if (!result.ok) {
      const message = `public launcher smoke failed for ${input.releaseId}: ${result.detail ?? 'no detail'}`;
      throw result.retryable ? transientFailure(message) : rejectingFailure(message);
    }
    return buildEvidence({
      request: {
        receiptId: input.receiptId,
        candidateId: input.candidateId,
        expectedBundleSha256: input.bundleSha256,
        operation: 'publish-artifacts',
      },
      ciRunId: this.options.ciRunId,
      observedAt: (this.options.now ?? nowIso)(),
    });
  }
}

export interface CiActivationOptions extends CiDeliveryOptions {
  /** Non-public staging prefix; never a key a launcher resolves. */
  stagingPrefix?: string;
}

/**
 * Channel pointer operations (§6A.5 activation/promotion ordering).
 *
 * The one authoritative write in the whole delivery plane is `commitChannel`'s
 * `writeDocumentWithCas`. Everything else here is either non-public
 * (`stageChannel`), derived and best-effort (`moveAlias`) or read-only
 * (`readPointer`, `probePublic`).
 */
export class CiActivationAdapter implements ActivationAdapter {
  constructor(private readonly options: CiActivationOptions) {}

  private get now(): () => string {
    return this.options.now ?? nowIso;
  }

  private async emit(evidence: DeliveryEvidence): Promise<void> {
    await this.options.emit?.(evidence);
  }

  async readPointer(channel: string): Promise<{ pointerSha256: string | null; releaseId: string | null }> {
    const object = await this.options.cas.read(channelPointerKey(channel));
    if (!object) { return { pointerSha256: null, releaseId: null }; }
    const pointer = ReleaseChannelPointerSchema.parse(JSON.parse(object.body));
    return { pointerSha256: channelPointerSha256(pointer), releaseId: pointer.releaseId };
  }

  async stageChannel(rawRequest: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const request = ReleaseDeliveryRequestSchema.parse(rawRequest);
    const channel = this.requireChannel(request);
    const bundle = await resolveVerifiedBundle(this.options, request);
    const sealed = readSealedPointer(bundle.dir, channel, request.pointerPlanSha256);

    // Staged under a key no launcher resolves, so Phase B proves the bytes are
    // publishable without making them public.
    const key = `${this.options.stagingPrefix ?? 'staging'}/${channel}/${request.candidateId}.json`;
    const outcome = await writeDocumentWithCas({
      store: this.options.cas,
      key,
      body: sealed.body,
      sha256: sealed.sha256,
      digestOf: body => channelPointerSha256(ReleaseChannelPointerSchema.parse(JSON.parse(body))),
    });
    const evidence = buildEvidence({
      request,
      ciRunId: this.options.ciRunId,
      observedAt: this.now(),
      artifacts: [{ url: `https://pointers.invalid/${outcome.key}`, sha256: outcome.sha256 }],
    });
    await this.emit(evidence);
    return evidence;
  }

  async commitChannel(rawRequest: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const request = ReleaseDeliveryRequestSchema.parse(rawRequest);
    if (request.operation !== 'commit-channel' && request.operation !== 'compensate-channel') {
      throw rejectingFailure(`commitChannel refuses operation ${request.operation}`);
    }
    const channel = this.requireChannel(request);
    if (request.operation === 'compensate-channel' && !request.pointerPlanSha256) {
      // Without a target digest the sealed-pointer lookup would fall back to the
      // channel's own `<channel>.json` — the pointer this compensation exists to
      // undo — and republish it as a "successful" rollback. A compensation that
      // cannot name what it restores has nothing to restore, which is exactly the
      // first-ever-pointer case: there is no delete verb here, so it must stop
      // and be reconciled rather than report success.
      throw rejectingFailure(
        `compensating the ${channel} pointer requires the digest of the sealed pointer bytes to restore; `
        + 'the request carries none, and CI never renders a pointer of its own',
      );
    }
    const bundle = await resolveVerifiedBundle(this.options, request);
    const sealed = readSealedPointer(bundle.dir, channel, request.pointerPlanSha256);

    const outcome = await writeDocumentWithCas({
      store: this.options.cas,
      key: channelPointerKey(channel),
      body: sealed.body,
      sha256: sealed.sha256,
      // `undefined` here would mean "do not assert"; the saga always supplies a
      // value (possibly `null`, meaning "no pointer has ever existed"), so a
      // blind overwrite is not reachable through the sagas.
      ...(request.expectedPreviousPointerSha256 !== undefined
        ? { expectedPreviousSha256: request.expectedPreviousPointerSha256 }
        : {}),
      digestOf: body => channelPointerSha256(ReleaseChannelPointerSchema.parse(JSON.parse(body))),
    });

    const evidence = buildEvidence({
      request,
      ciRunId: this.options.ciRunId,
      observedAt: this.now(),
      artifacts: [{ url: `https://pointers.invalid/${outcome.key}`, sha256: outcome.sha256 }],
    });
    await this.emit(evidence);
    return evidence;
  }

  /**
   * Derived npm alias. Never blocks and never compensates (§6A.5 step 3).
   *
   * The failure is swallowed into `result: 'degraded'` rather than thrown,
   * because the caller's contract treats a thrown error and a degraded result
   * differently only in how loudly it records them — and a dist-tag is not a
   * resolution surface, so neither may stop the pointer commit.
   */
  async moveAlias(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    package: string;
    tag: string;
    version: string;
  }): Promise<DeliveryEvidence> {
    let result: DeliveryEvidence['result'] = 'succeeded';
    try {
      await this.options.npm.moveDistTag({ name: input.package, version: input.version, tag: input.tag });
      const remote = await this.options.npm.read(input.package);
      if (remote?.distTags[input.tag] !== input.version) { result = 'degraded'; }
    } catch {
      result = 'degraded';
    }
    const evidence = buildEvidence({
      request: {
        receiptId: input.receiptId,
        candidateId: input.candidateId,
        expectedBundleSha256: input.bundleSha256,
        operation: 'commit-channel',
      },
      ciRunId: this.options.ciRunId,
      observedAt: this.now(),
      observedDistTags: [{ package: input.package, tag: input.tag, version: input.version }],
      result,
    });
    await this.emit(evidence);
    return evidence;
  }

  /**
   * §6A.5 step 5 — fetch the public state back and confirm it resolves to the
   * release just committed.
   *
   * A stale or absent read is transient: mutable documents propagate, and the
   * saga's bounded retry is the right response. A pointer that resolves to a
   * *different* release is not transient — it is drift, and it must not be
   * retried into submission.
   */
  async probePublic(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    channel: string;
    expectedReleaseId: string;
  }): Promise<DeliveryEvidence> {
    const observed = await this.readPointer(input.channel);
    if (observed.releaseId === null) {
      throw transientFailure(`the public ${input.channel} pointer is not yet readable`);
    }
    if (observed.releaseId !== input.expectedReleaseId) {
      throw rejectingFailure(
        `the public ${input.channel} pointer resolves to ${observed.releaseId}, expected ${input.expectedReleaseId}`,
      );
    }
    return buildEvidence({
      request: {
        receiptId: input.receiptId,
        candidateId: input.candidateId,
        expectedBundleSha256: input.bundleSha256,
        operation: 'commit-channel',
        targetChannel: input.channel as DeliveryEvidence['targetChannel'],
      },
      ciRunId: this.options.ciRunId,
      observedAt: this.now(),
      artifacts: observed.pointerSha256
        ? [{ url: `https://pointers.invalid/${channelPointerKey(input.channel)}`, sha256: observed.pointerSha256 }]
        : [],
    });
  }

  private requireChannel(request: ReleaseDeliveryRequest): string {
    if (!request.targetChannel) {
      throw rejectingFailure(`${request.operation} requires a target channel`);
    }
    return request.targetChannel;
  }
}
