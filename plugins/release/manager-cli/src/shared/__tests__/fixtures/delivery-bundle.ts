/**
 * A sealed bundle that is *deliverable*, built on top of the golden bundle.
 *
 * The golden fixture already proves the seven verification rules; PR 6's
 * delivery plane needs two things on top of it that the verifier does not care
 * about but `ci-delivery.ts` does — a `packaging.json` naming the npm tarballs
 * and launcher binaries to publish, and the sealed channel-pointer bytes CI is
 * permitted to put (and never to render).
 *
 * Both are added through the golden builder's `extraFiles` seam rather than
 * written beside the bundle, so they land in the closed inventory and the result
 * is a bundle that still passes `verifyBundleDirectory` — a delivery test that
 * ran against a bundle the verifier would have rejected would prove nothing
 * about the real ordering, where verification comes first.
 */

import { createHash } from 'node:crypto';

import { canonicalSha256, type ReleaseChannelPointer } from '@kb-labs/release-manager-contracts';

import {
  GOLDEN_BINARY_VERSION,
  GOLDEN_PLATFORM_VERSION,
  GOLDEN_SDK_VERSION,
  buildGoldenBundle,
  goldenBundleFiles,
  type GoldenBundleOverrides,
} from './golden-bundle.js';

export const DELIVERY_RELEASE_ID = `platform-${GOLDEN_PLATFORM_VERSION}`;
export const DELIVERY_CANDIDATE_ID = `platform-${GOLDEN_PLATFORM_VERSION}-a`;

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The three publishable packages, in the order `packaging.json` lists them. */
export const DELIVERY_PACKAGES = [
  { name: '@kb-labs/core-runtime', version: GOLDEN_PLATFORM_VERSION, tarball: 'npm/kb-labs-core-runtime.tgz' },
  { name: '@kb-labs/plugin-release', version: GOLDEN_PLATFORM_VERSION, tarball: 'npm/kb-labs-plugin-release.tgz' },
  { name: '@kb-labs/sdk', version: GOLDEN_SDK_VERSION, tarball: 'npm/kb-labs-sdk.tgz' },
] as const;

/**
 * Launcher assets.
 *
 * The filenames carry os/arch because a GitHub release keys assets by name and
 * two binaries both called `kb-create` would silently become one asset.
 */
export const DELIVERY_BINARIES = [
  { os: 'linux', arch: 'amd64', path: 'bin/linux-amd64/kb-create', filename: 'kb-create-linux-amd64' },
  { os: 'darwin', arch: 'arm64', path: 'bin/darwin-arm64/kb-create', filename: 'kb-create-darwin-arm64' },
] as const;

export function packagingRecordBytes(): string {
  const files = goldenBundleFiles();
  return stableJson({
    schema: 'kb.release-packaging/1',
    releaseId: DELIVERY_RELEASE_ID,
    candidateId: DELIVERY_CANDIDATE_ID,
    intentSha256: 'b'.repeat(64),
    plannedCommit: 'a'.repeat(40),
    treeSha256: 'd'.repeat(64),
    packages: DELIVERY_PACKAGES.map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      tarball: pkg.tarball,
      sha256: sha256(files[pkg.tarball]!),
    })),
    binaries: DELIVERY_BINARIES.map(binary => ({
      id: 'kb-create',
      os: binary.os,
      arch: binary.arch,
      filename: binary.filename,
      url: `https://github.com/kb-labs/kb-labs/releases/download/${DELIVERY_RELEASE_ID}/${binary.filename}`,
      sha256: sha256(files[binary.path]!),
      path: binary.path,
    })),
  });
}

export interface SealedPointer {
  body: string;
  sha256: string;
  pointer: ReleaseChannelPointer;
}

/** Sealed pointer bytes for one channel/release, exactly as the plugin would seal them. */
export function sealedPointer(channel: 'canary' | 'stable' | 'experimental', releaseId: string): SealedPointer {
  const pointer: ReleaseChannelPointer = {
    schema: 'kb.release-channel/1',
    channel,
    releaseId,
    release: {
      path: `releases/${releaseId}/release.json`,
      // A stand-in for the exact release descriptor's digest: the pointer's own
      // digest is what every precondition in the delivery plane compares, and it
      // only has to be stable, not resolvable.
      sha256: sha256(`release-descriptor:${releaseId}`),
    },
    signature: null,
  };
  return { pointer, body: stableJson(pointer), sha256: canonicalSha256(pointer) };
}

export interface DeliveryBundleOptions {
  /**
   * Extra sealed pointers, digest-addressed as `pointers/<channel>.<sha>.json`.
   * A promotion's compensation target lives here: it is authorised by the same
   * approval but belongs to the release being rolled back *to*.
   */
  alsoSeal?: readonly SealedPointer[];
  /** Channel whose own pointer is sealed at `pointers/<channel>.json`. */
  channel?: 'canary' | 'stable' | 'experimental';
  /** Release the sealed channel pointer resolves to. */
  releaseId?: string;
  /** Passed through to the golden builder, for negative fixtures. */
  golden?: GoldenBundleOverrides;
  /** Omit `packaging.json` from both disk and inventory. */
  withoutPackaging?: boolean;
  /** Omit the sealed channel pointer entirely. */
  withoutPointer?: boolean;
}

export interface DeliveryBundle {
  bundleSha256: string;
  releaseId: string;
  candidateId: string;
  indexSha256: string;
  pointer: SealedPointer;
}

/** Writes a sealed, delivery-ready bundle into `root`. */
export function buildDeliveryBundle(root: string, options: DeliveryBundleOptions = {}): DeliveryBundle {
  const channel = options.channel ?? 'stable';
  const releaseId = options.releaseId ?? DELIVERY_RELEASE_ID;
  const pointer = sealedPointer(channel, releaseId);

  const extraFiles: Record<string, string | null> = {
    ...(options.golden?.extraFiles ?? {}),
    'packaging.json': options.withoutPackaging ? null : packagingRecordBytes(),
    ...(options.withoutPointer ? {} : { [`pointers/${channel}.json`]: pointer.body }),
  };
  for (const extra of options.alsoSeal ?? []) {
    extraFiles[`pointers/${extra.pointer.channel}.${extra.sha256}.json`] = extra.body;
  }

  const built = buildGoldenBundle(root, { ...options.golden, extraFiles });
  return {
    bundleSha256: built.bundleSha256,
    releaseId: built.provenance.releaseId,
    candidateId: built.provenance.candidateId,
    indexSha256: built.provenance.index.sha256,
    pointer,
  };
}

export { GOLDEN_BINARY_VERSION, GOLDEN_PLATFORM_VERSION, GOLDEN_SDK_VERSION };
