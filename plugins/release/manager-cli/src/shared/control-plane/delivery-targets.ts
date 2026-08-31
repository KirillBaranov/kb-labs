/**
 * The immutable publication surfaces CI writes to, behind interfaces narrow
 * enough that the delivery logic cannot do anything §6A.5 forbids.
 *
 * Two targets, both immutable by contract:
 *
 * - **npm** — exact tarballs at exact versions, published under a candidate
 *   dist-tag derived from the candidate id. Never `latest`/`stable`/`canary`/
 *   `experimental`: those are channel names, and a channel is resolved through
 *   the pointer document, not through npm (decision S0.3b). `moveDistTag`
 *   exists separately and is only ever called on the best-effort alias path.
 * - **release assets** — launcher binaries, the sealed release index and the
 *   exact release descriptor as GitHub Releases assets (§3.1: immutable, free,
 *   no CAS required *because* nothing ever replaces them).
 *
 * ## What is deliberately missing
 *
 * There is no `overwrite`, no `clobber` and no `replaceAsset`. §6A.5 states the
 * idempotency rule as "same hash → success with `reused=true`; different bytes
 * at the same identity → hard conflict; no overwrite", and the cheapest way to
 * guarantee the last clause is to give the delivery code no verb for it. The
 * old `release-deliver-candidate.yml` relied on a shell comment asking future
 * editors not to pass `--clobber`; a missing method is a stronger promise.
 *
 * ## Read-back is part of publishing
 *
 * §6A.5 ordering step 3 requires downloading the remote asset and comparing
 * hashes after publication, so `download` is on the interface rather than being
 * a testing convenience. A registry that accepted a write and serves different
 * bytes is exactly the failure this catches, and it cannot be caught by trusting
 * the write's own response.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';

import { ReleaseAdapterError } from './adapters.js';

export interface PublishedNpmVersion {
  version: string;
  /**
   * Digest of the published tarball, or `''` when the transport cannot report
   * one cheaply. The empty string means *unknown*, never *different*: the npm
   * registry publishes `integrity`, not a bare sha256, so a client that has not
   * downloaded the tarball must say so rather than let a caller mistake silence
   * for a mismatch and declare a conflict over a byte-identical republish.
   */
  sha256: string;
}

export interface NpmPackageState {
  name: string;
  versions: readonly PublishedNpmVersion[];
  distTags: Readonly<Record<string, string>>;
}

export interface NpmRegistry {
  /** `null` when the package has never been published. */
  read(name: string): Promise<NpmPackageState | null>;
  publish(input: { name: string; version: string; tag: string; tarballPath: string; sha256: string }): Promise<void>;
  /** Derived alias moves only — never used to make a channel resolvable. */
  moveDistTag(input: { name: string; version: string; tag: string }): Promise<void>;
  /**
   * Authoritative digest of an already-published tarball, obtained by fetching
   * it. Optional because it costs a download; when `read` reports `''` it is the
   * only way to tell `reused` from a hard conflict, so a client that offers
   * neither leaves delivery unable to decide — which it then reports as a
   * transient failure rather than guessing.
   */
  tarballSha256?(name: string, version: string): Promise<string | null>;
}

export interface RemoteAsset {
  name: string;
  sha256: string;
  url: string;
}

export interface ReleaseAssetStore {
  /** `null` when no release exists at that tag. */
  read(tag: string): Promise<readonly RemoteAsset[] | null>;
  create(input: { tag: string; title: string; notes: string }): Promise<void>;
  upload(input: { tag: string; name: string; path: string; sha256: string }): Promise<RemoteAsset>;
  download(input: { tag: string; name: string }): Promise<Buffer>;
}

/**
 * The candidate dist-tag.
 *
 * Derived from the candidate id and prefixed, so it is impossible for it to
 * collide with a channel name even if a candidate were ever named `stable`.
 * §6A.5 step 4 requires exactly this: unique, non-channel, and not a resolution
 * surface for the launcher.
 */
export const CHANNEL_DIST_TAGS = ['latest', 'stable', 'canary', 'experimental'] as const;

export function candidateDistTag(candidateId: string): string {
  const slug = candidateId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '');
  if (!slug) { throw new Error(`candidate id yields no usable dist-tag: ${candidateId}`); }
  const tag = `candidate-${slug}`;
  assertNotChannelDistTag(tag);
  return tag;
}

export function assertNotChannelDistTag(tag: string): void {
  if ((CHANNEL_DIST_TAGS as readonly string[]).includes(tag)) {
    throw new ReleaseAdapterError(
      `refusing to publish under the channel dist-tag "${tag}": immutable publication may only use a `
      + 'unique candidate tag (§6A.5 step 4). Channel visibility is the pointer document\'s job.',
      { retryable: false, code: ReleaseControlDiagnosticCode.DeliveryRejected },
    );
  }
}

export function sha256Of(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ── Fakes ────────────────────────────────────────────────────────────────────
//
// Honest implementations rather than stubs, for the same reason PR 5's adapter
// fakes are: the DoD cases (duplicate, mismatch, partial delivery, propagation
// delay, crash between tag writes) are all statements about a target that
// *remembers* what it was asked to do, and none of them is expressible against
// a stub that always succeeds.

export type FakeFault = () => never;

export class InMemoryNpmRegistry implements NpmRegistry {
  private readonly packages = new Map<string, { versions: PublishedNpmVersion[]; distTags: Record<string, string> }>();
  private readonly faults = new Map<string, FakeFault[]>();
  /** Reads that must still report the pre-publish state, per package. */
  private readonly propagationDelay = new Map<string, number>();
  readonly published: Array<{ name: string; version: string; tag: string; sha256: string }> = [];
  readonly tagMoves: Array<{ name: string; version: string; tag: string }> = [];

  seed(name: string, version: string, sha256: string, distTags: Record<string, string> = {}): this {
    const entry = this.packages.get(name) ?? { versions: [], distTags: {} };
    entry.versions.push({ version, sha256 });
    Object.assign(entry.distTags, distTags);
    this.packages.set(name, entry);
    return this;
  }

  /** The registry accepted the write but will not serve it for `reads` more reads. */
  delayPropagation(name: string, reads: number): this {
    this.propagationDelay.set(name, reads);
    return this;
  }

  failNext(operation: string, fault: FakeFault): this {
    this.faults.set(operation, [...(this.faults.get(operation) ?? []), fault]);
    return this;
  }

  private trip(operation: string): void {
    const next = this.faults.get(operation)?.shift();
    if (next) { next(); }
  }

  async read(name: string): Promise<NpmPackageState | null> {
    this.trip(`read:${name}`);
    const pending = this.propagationDelay.get(name) ?? 0;
    if (pending > 0) {
      this.propagationDelay.set(name, pending - 1);
      return null;
    }
    const entry = this.packages.get(name);
    return entry ? { name, versions: [...entry.versions], distTags: { ...entry.distTags } } : null;
  }

  async publish(input: { name: string; version: string; tag: string; tarballPath: string; sha256: string }): Promise<void> {
    this.trip(`publish:${input.name}@${input.version}`);
    assertNotChannelDistTag(input.tag);
    const entry = this.packages.get(input.name) ?? { versions: [], distTags: {} };
    if (entry.versions.some(candidate => candidate.version === input.version)) {
      throw new Error(`npm rejects a republish of ${input.name}@${input.version}`);
    }
    entry.versions.push({ version: input.version, sha256: input.sha256 });
    entry.distTags[input.tag] = input.version;
    this.packages.set(input.name, entry);
    this.published.push({ name: input.name, version: input.version, tag: input.tag, sha256: input.sha256 });
  }

  async moveDistTag(input: { name: string; version: string; tag: string }): Promise<void> {
    this.trip(`tag:${input.name}@${input.tag}`);
    const entry = this.packages.get(input.name);
    if (!entry) { throw new Error(`cannot tag an unpublished package: ${input.name}`); }
    entry.distTags[input.tag] = input.version;
    this.tagMoves.push(input);
  }
}

export class InMemoryReleaseAssetStore implements ReleaseAssetStore {
  private readonly releases = new Map<string, Map<string, { asset: RemoteAsset; bytes: Buffer }>>();
  private readonly faults = new Map<string, FakeFault[]>();
  readonly uploads: Array<{ tag: string; name: string; sha256: string }> = [];

  seed(tag: string, name: string, bytes: Buffer): this {
    const release = this.releases.get(tag) ?? new Map();
    release.set(name, {
      asset: { name, sha256: sha256Of(bytes), url: `https://assets.invalid/${tag}/${name}` },
      bytes,
    });
    this.releases.set(tag, release);
    return this;
  }

  failNext(operation: string, fault: FakeFault): this {
    this.faults.set(operation, [...(this.faults.get(operation) ?? []), fault]);
    return this;
  }

  private trip(operation: string): void {
    const next = this.faults.get(operation)?.shift();
    if (next) { next(); }
  }

  async read(tag: string): Promise<readonly RemoteAsset[] | null> {
    this.trip(`read:${tag}`);
    const release = this.releases.get(tag);
    return release ? [...release.values()].map(entry => entry.asset) : null;
  }

  async create(input: { tag: string; title: string; notes: string }): Promise<void> {
    this.trip(`create:${input.tag}`);
    if (!this.releases.has(input.tag)) { this.releases.set(input.tag, new Map()); }
  }

  async upload(input: { tag: string; name: string; path: string; sha256: string }): Promise<RemoteAsset> {
    this.trip(`upload:${input.tag}/${input.name}`);
    const release = this.releases.get(input.tag);
    if (!release) { throw new Error(`no release at ${input.tag}`); }
    if (release.has(input.name)) {
      // The store itself refuses replacement, so no caller can implement
      // `--clobber` by accident.
      throw new Error(`asset already exists and is immutable: ${input.tag}/${input.name}`);
    }
    const bytes = readFileSync(input.path);
    const asset: RemoteAsset = { name: input.name, sha256: input.sha256, url: `https://assets.invalid/${input.tag}/${input.name}` };
    release.set(input.name, { asset, bytes });
    this.uploads.push({ tag: input.tag, name: input.name, sha256: input.sha256 });
    return asset;
  }

  async download(input: { tag: string; name: string }): Promise<Buffer> {
    this.trip(`download:${input.tag}/${input.name}`);
    const entry = this.releases.get(input.tag)?.get(input.name);
    if (!entry) { throw new Error(`no asset ${input.name} at ${input.tag}`); }
    return entry.bytes;
  }

  /** Test seam: make a published asset serve different bytes than it reports. */
  corrupt(tag: string, name: string, bytes: Buffer): void {
    const entry = this.releases.get(tag)?.get(name);
    if (entry) { entry.bytes = bytes; }
  }
}
