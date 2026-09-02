/**
 * Deterministic golden bundle used by the verifier tests and checked in at
 * `fixtures/release/golden` so the documented
 * `kb release verify-bundle --bundle ./fixtures/release/golden` invocation is
 * always runnable.
 *
 * Everything here is byte-stable: fixed contents, fixed timestamps, sorted
 * keys. Two builds of this fixture must produce the same `bundleSha256`, or the
 * verifier's own regression corpus would drift underneath it.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  ReleaseBundleProvenanceSchema,
  canonicalSha256,
  releaseGraphNodeKey,
  type ReleaseBundle,
  type ReleaseBundleProvenance,
} from '@kb-labs/release-manager-contracts';

export const GOLDEN_PLATFORM_VERSION = '2.119.0';
export const GOLDEN_SDK_VERSION = '1.4.0';
export const GOLDEN_BINARY_VERSION = '0.9.3';
const GOLDEN_TREE_SHA256 = 'd'.repeat(64);
const GOLDEN_INTENT_SHA256 = 'b'.repeat(64);
const GOLDEN_COMMIT = 'a'.repeat(40);

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** Payload bytes of the golden bundle, keyed by bundle-relative path. */
export function goldenBundleFiles(): Record<string, string> {
  return {
    'npm/kb-labs-core-runtime.tgz': `fake-tarball:@kb-labs/core-runtime@${GOLDEN_PLATFORM_VERSION}\n`,
    'npm/kb-labs-plugin-release.tgz': `fake-tarball:@kb-labs/plugin-release@${GOLDEN_PLATFORM_VERSION}\n`,
    'npm/kb-labs-sdk.tgz': `fake-tarball:@kb-labs/sdk@${GOLDEN_SDK_VERSION}\n`,
    'bin/linux-amd64/kb-create': `fake-binary:kb-create@${GOLDEN_BINARY_VERSION}:linux/amd64\n`,
    'bin/darwin-arm64/kb-create': `fake-binary:kb-create@${GOLDEN_BINARY_VERSION}:darwin/arm64\n`,
  };
}

export interface GoldenBundleOverrides {
  /** Applied to the provenance document before it is written and hashed. */
  provenance?: (draft: ReleaseBundleProvenance) => ReleaseBundleProvenance;
  /** Applied to the bundle manifest after every hash is computed, before sealing. */
  bundle?: (draft: Omit<ReleaseBundle, 'bundleSha256'>) => Omit<ReleaseBundle, 'bundleSha256'>;
  /** Extra raw files written to disk; `null` content skips writing the file. */
  extraFiles?: Record<string, string | null>;
  /** Bundle-relative paths to delete from disk after writing. */
  omitFromDisk?: string[];
  /** Release-index label, so the 2.119-provenance / 2.118-index regression is expressible. */
  indexVersion?: string;
}

function baseProvenance(indexVersion: string, indexSha256: string): ReleaseBundleProvenance {
  const binaryNode = (os: 'linux' | 'darwin', arch: 'amd64' | 'arm64'): string =>
    releaseGraphNodeKey({ id: 'kb-create', kind: 'binary', version: GOLDEN_BINARY_VERSION, os, arch });
  const packageNode = (id: string, version: string): string =>
    releaseGraphNodeKey({ id, kind: 'package', version });

  const files = goldenBundleFiles();

  return {
    schema: 'kb.release-bundle-provenance/1',
    releaseId: `platform-${GOLDEN_PLATFORM_VERSION}`,
    candidateId: `platform-${GOLDEN_PLATFORM_VERSION}-a`,
    provenance: {
      plannedCommit: GOLDEN_COMMIT,
      treeSha256: GOLDEN_TREE_SHA256,
      intentSha256: GOLDEN_INTENT_SHA256,
      sealedAt: '2026-08-30T00:00:00Z',
      versions: { platform: GOLDEN_PLATFORM_VERSION, sdk: GOLDEN_SDK_VERSION },
    },
    plannedPackages: [
      { name: '@kb-labs/core-runtime', version: GOLDEN_PLATFORM_VERSION },
      { name: '@kb-labs/plugin-release', version: GOLDEN_PLATFORM_VERSION },
      { name: '@kb-labs/sdk', version: GOLDEN_SDK_VERSION },
      { name: '@kb-labs/legacy-shim', version: GOLDEN_PLATFORM_VERSION },
    ],
    packages: [
      {
        name: '@kb-labs/core-runtime',
        version: GOLDEN_PLATFORM_VERSION,
        classification: 'platform',
        tarball: 'npm/kb-labs-core-runtime.tgz',
        sha256: sha256(files['npm/kb-labs-core-runtime.tgz']!),
      },
      {
        name: '@kb-labs/plugin-release',
        version: GOLDEN_PLATFORM_VERSION,
        classification: 'plugin',
        tarball: 'npm/kb-labs-plugin-release.tgz',
        sha256: sha256(files['npm/kb-labs-plugin-release.tgz']!),
      },
      {
        name: '@kb-labs/sdk',
        version: GOLDEN_SDK_VERSION,
        classification: 'sdk',
        tarball: 'npm/kb-labs-sdk.tgz',
        sha256: sha256(files['npm/kb-labs-sdk.tgz']!),
      },
      // Present to prove the escape hatch is explicit rather than a silent skip.
      {
        name: '@kb-labs/legacy-shim',
        version: GOLDEN_PLATFORM_VERSION,
        classification: 'deliveryOnly',
        tarball: null,
        sha256: null,
      },
    ],
    binaries: [
      {
        id: 'kb-create',
        version: GOLDEN_BINARY_VERSION,
        os: 'linux',
        arch: 'amd64',
        path: 'bin/linux-amd64/kb-create',
        sha256: sha256(files['bin/linux-amd64/kb-create']!),
      },
      {
        id: 'kb-create',
        version: GOLDEN_BINARY_VERSION,
        os: 'darwin',
        arch: 'arm64',
        path: 'bin/darwin-arm64/kb-create',
        sha256: sha256(files['bin/darwin-arm64/kb-create']!),
      },
    ],
    index: {
      path: 'release-index.json',
      sha256: indexSha256,
      version: indexVersion,
      channelLabel: 'canary',
    },
    graph: {
      nodes: [
        { id: '@kb-labs/core-runtime', kind: 'package', version: GOLDEN_PLATFORM_VERSION },
        { id: '@kb-labs/plugin-release', kind: 'package', version: GOLDEN_PLATFORM_VERSION },
        { id: '@kb-labs/sdk', kind: 'package', version: GOLDEN_SDK_VERSION },
        { id: 'kb-create', kind: 'binary', version: GOLDEN_BINARY_VERSION, os: 'linux', arch: 'amd64' },
        { id: 'kb-create', kind: 'binary', version: GOLDEN_BINARY_VERSION, os: 'darwin', arch: 'arm64' },
      ],
      edges: [
        {
          from: packageNode('@kb-labs/plugin-release', GOLDEN_PLATFORM_VERSION),
          to: packageNode('@kb-labs/core-runtime', GOLDEN_PLATFORM_VERSION),
          kind: 'requires',
          range: `^${GOLDEN_PLATFORM_VERSION}`,
        },
        {
          from: packageNode('@kb-labs/plugin-release', GOLDEN_PLATFORM_VERSION),
          to: packageNode('@kb-labs/sdk', GOLDEN_SDK_VERSION),
          kind: 'requires',
          range: '^1.4.0',
        },
        {
          from: binaryNode('linux', 'amd64'),
          to: packageNode('@kb-labs/core-runtime', GOLDEN_PLATFORM_VERSION),
          kind: 'provides',
          range: `>=${GOLDEN_PLATFORM_VERSION} <3.0.0`,
        },
        {
          from: binaryNode('darwin', 'arm64'),
          to: packageNode('@kb-labs/core-runtime', GOLDEN_PLATFORM_VERSION),
          kind: 'provides',
          range: `>=${GOLDEN_PLATFORM_VERSION} <3.0.0`,
        },
      ],
      profiles: [
        {
          id: 'linux-amd64',
          members: [
            packageNode('@kb-labs/core-runtime', GOLDEN_PLATFORM_VERSION),
            packageNode('@kb-labs/plugin-release', GOLDEN_PLATFORM_VERSION),
            packageNode('@kb-labs/sdk', GOLDEN_SDK_VERSION),
          ],
          providers: [binaryNode('linux', 'amd64')],
        },
        {
          id: 'darwin-arm64',
          members: [
            packageNode('@kb-labs/core-runtime', GOLDEN_PLATFORM_VERSION),
            packageNode('@kb-labs/plugin-release', GOLDEN_PLATFORM_VERSION),
            packageNode('@kb-labs/sdk', GOLDEN_SDK_VERSION),
          ],
          providers: [binaryNode('darwin', 'arm64')],
        },
      ],
    },
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function write(root: string, relativePath: string, content: string): void {
  const full = resolve(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/**
 * Writes a complete, sealed golden bundle into `root` and returns its digest.
 *
 * Overrides exist so the negative corpus is a *mutation of the real golden*
 * rather than a hand-written near-miss — a negative fixture that drifted away
 * from the positive one would stop proving anything.
 */
export function buildGoldenBundle(root: string, overrides: GoldenBundleOverrides = {}): {
  bundleSha256: string;
  provenance: ReleaseBundleProvenance;
} {
  const indexVersion = overrides.indexVersion ?? GOLDEN_PLATFORM_VERSION;
  const indexBytes = stableJson({
    schema: 'kb.release-index/1',
    channel: 'canary',
    version: indexVersion,
    packages: ['@kb-labs/core-runtime', '@kb-labs/plugin-release', '@kb-labs/sdk'],
  });

  const draftProvenance = baseProvenance(indexVersion, sha256(indexBytes));
  const provenance = ReleaseBundleProvenanceSchema.parse(
    overrides.provenance ? overrides.provenance(draftProvenance) : draftProvenance,
  );
  const provenanceBytes = stableJson(provenance);

  const payload: Record<string, string> = {
    ...goldenBundleFiles(),
    'release-index.json': indexBytes,
    'provenance.json': provenanceBytes,
  };

  for (const [path, content] of Object.entries(overrides.extraFiles ?? {})) {
    if (content !== null) { payload[path] = content; }
  }

  const omit = new Set(overrides.omitFromDisk ?? []);
  for (const [path, content] of Object.entries(payload)) {
    if (!omit.has(path)) { write(root, path, content); }
  }

  // The inventory is derived from the payload, not from disk, so an omitted
  // file stays listed — which is exactly the "missing tarball" negative case.
  const files = Object.keys(payload).sort().map(path => ({
    path,
    sha256: sha256(payload[path]!),
    size: Buffer.byteLength(payload[path]!),
  }));

  const draftBundle: Omit<ReleaseBundle, 'bundleSha256'> = {
    schema: 'kb.release-bundle/1',
    releaseId: provenance.releaseId,
    candidateId: provenance.candidateId,
    intentSha256: provenance.provenance.intentSha256,
    indexSha256: provenance.index.sha256,
    treeSha256: provenance.provenance.treeSha256,
    files,
  };
  const bundleSource = overrides.bundle ? overrides.bundle(draftBundle) : draftBundle;
  const bundleSha256 = canonicalSha256({ ...bundleSource, bundleSha256: '' });
  write(root, 'bundle.json', stableJson({ ...bundleSource, bundleSha256 }));

  return { bundleSha256, provenance };
}

/** Repo-relative location of the checked-in golden bundle. */
export const GOLDEN_BUNDLE_DIR = join('fixtures', 'release', 'golden');
