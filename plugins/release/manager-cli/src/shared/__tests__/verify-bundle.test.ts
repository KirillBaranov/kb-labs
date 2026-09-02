/**
 * Verifier coverage for the seven bundle rules of cutover plan §6A.2.
 *
 * Every negative case is a mutation of the same golden bundle, so a rule can
 * only pass here by actually rejecting the specific inconsistency — not by the
 * fixture happening to be malformed in some other way as well.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyBundleDirectory } from '../verify-bundle';
import {
  GOLDEN_BINARY_VERSION,
  GOLDEN_PLATFORM_VERSION,
  buildGoldenBundle,
  type GoldenBundleOverrides,
} from './fixtures/golden-bundle';

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const CHECKED_IN_GOLDEN = join(REPO_ROOT, 'fixtures', 'release', 'golden');

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Flips one byte in place, keeping the file length identical — a length-changing
 * edit would trip the cheap size check and never exercise the hash comparison.
 */
function tamperBytes(path: string): void {
  const bytes = readFileSync(path);
  bytes[0] = bytes[0]! ^ 0xff;
  writeFileSync(path, bytes);
}

describe('verifyBundleDirectory', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `verify-bundle-${randomBytes(6).toString('hex')}`);
    mkdirSync(root, { recursive: true });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const build = (overrides?: GoldenBundleOverrides): string => buildGoldenBundle(root, overrides).bundleSha256;
  const codes = (dir = root, expected?: string): string[] =>
    verifyBundleDirectory(dir, expected).diagnostics.map(diagnostic => diagnostic.code);

  describe('positive', () => {
    it('accepts the golden bundle and counts everything it verified', () => {
      const digest = build();
      const report = verifyBundleDirectory(root, digest);

      expect(report.diagnostics).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.releaseId).toBe(`platform-${GOLDEN_PLATFORM_VERSION}`);
      expect(report.counts).toEqual({
        files: 7, packages: 4, tarballs: 3, binaries: 2, nodes: 5, edges: 4, profiles: 2,
      });
    });

    it('is byte-deterministic: two builds of the same input seal to one digest', () => {
      const other = join(tmpdir(), `verify-bundle-${randomBytes(6).toString('hex')}`);
      try {
        expect(build()).toBe(buildGoldenBundle(other).bundleSha256);
        expect(readFileSync(join(root, 'bundle.json'), 'utf8'))
          .toBe(readFileSync(join(other, 'bundle.json'), 'utf8'));
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    it('verifies the checked-in golden bundle that the documented CLI invocation targets', () => {
      const report = verifyBundleDirectory(CHECKED_IN_GOLDEN);
      expect(report.diagnostics).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it('rejects an approved digest that does not match the sealed bundle', () => {
      build();
      expect(codes(root, 'e'.repeat(64))).toContain('KB_BUNDLE_DIGEST_MISMATCH');
    });
  });

  describe('rule 1 — npm manifest ↔ tarball correspondence', () => {
    it('rejects a missing tarball', () => {
      build({ omitFromDisk: ['npm/kb-labs-sdk.tgz'] });
      const found = codes();
      expect(found).toContain('KB_BUNDLE_FILE_MISSING');
      expect(found).toContain('KB_BUNDLE_TARBALL_BYTES_UNVERIFIED');
    });

    it('rejects altered tarball bytes', () => {
      build();
      tamperBytes(join(root, 'npm/kb-labs-sdk.tgz'));
      expect(codes()).toContain('KB_BUNDLE_HASH_MISMATCH');
    });

    it('rejects an npm manifest hash that disagrees with the inventory hash', () => {
      build({
        provenance: draft => ({
          ...draft,
          packages: draft.packages.map(pkg =>
            pkg.name === '@kb-labs/sdk' ? { ...pkg, sha256: 'f'.repeat(64) } : pkg),
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_TARBALL_HASH_DISAGREES');
    });

    it('rejects a tarball no package claims', () => {
      build({
        provenance: draft => ({
          ...draft,
          plannedPackages: draft.plannedPackages.filter(entry => entry.name !== '@kb-labs/sdk'),
          packages: draft.packages.filter(pkg => pkg.name !== '@kb-labs/sdk'),
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_UNCLAIMED_TARBALL');
    });

    it('rejects two packages claiming one tarball', () => {
      build({
        provenance: draft => ({
          ...draft,
          packages: draft.packages.map(pkg =>
            pkg.name === '@kb-labs/sdk'
              ? { ...pkg, tarball: 'npm/kb-labs-core-runtime.tgz' }
              : pkg),
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_TARBALL_CLAIMED_TWICE');
    });
  });

  describe('rule 2 — binary targets', () => {
    it('rejects a binary with no graph node for its exact target', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            nodes: draft.graph.nodes.filter(node => !(node.kind === 'binary' && node.arch === 'arm64')),
            edges: draft.graph.edges.filter(edge => !edge.from.includes('darwin/arm64')),
            profiles: draft.graph.profiles.filter(profile => profile.id !== 'darwin-arm64'),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_BINARY_WITHOUT_GRAPH_NODE');
    });

    it('rejects a binary shipped for a target the graph does not declare', () => {
      build({
        provenance: draft => ({
          ...draft,
          binaries: draft.binaries.map(binary =>
            binary.arch === 'arm64' ? { ...binary, arch: 'amd64' as const } : binary),
        }),
      });
      const found = codes();
      expect(found).toContain('KB_BUNDLE_BINARY_WITHOUT_GRAPH_NODE');
      expect(found).toContain('KB_BUNDLE_GRAPH_BINARY_NOT_SELECTED');
    });

    it('rejects a binary whose bytes do not match the recorded hash', () => {
      build();
      tamperBytes(join(root, 'bin/linux-amd64/kb-create'));
      expect(codes()).toContain('KB_BUNDLE_HASH_MISMATCH');
    });

    it('rejects a binary version that is not SemVer, because the version is mandatory', () => {
      build({
        provenance: draft => ({
          ...draft,
          binaries: draft.binaries.map(binary => ({ ...binary, version: 'latest' })),
          graph: {
            ...draft.graph,
            nodes: draft.graph.nodes.map(node =>
              node.kind === 'binary' ? { ...node, version: 'latest' } : node),
            edges: draft.graph.edges.map(edge => ({
              ...edge,
              from: edge.from.replace(GOLDEN_BINARY_VERSION, 'latest'),
            })),
            profiles: draft.graph.profiles.map(profile => ({
              ...profile,
              providers: profile.providers.map(p => p.replace(GOLDEN_BINARY_VERSION, 'latest')),
            })),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_BINARY_VERSION_INVALID');
    });
  });

  describe('rule 3 — cross-artifact provenance consistency', () => {
    // The regression the cutover plan makes permanent: provenance says 2.119
    // while the shipped release index is still labelled 2.118.
    it('rejects the 2.119 provenance / 2.118 index mismatch forever', () => {
      build({ indexVersion: '2.118.0' });
      const report = verifyBundleDirectory(root);

      expect(report.ok).toBe(false);
      expect(report.diagnostics).toContainEqual(expect.objectContaining({
        rule: 3,
        code: 'KB_BUNDLE_INDEX_VERSION_MISMATCH',
        message: `release index is labelled 2.118.0 but provenance records ${GOLDEN_PLATFORM_VERSION}`,
      }));
    });

    it('rejects a provenance that already claims a release commit', () => {
      build();
      const provenance = JSON.parse(readFileSync(join(root, 'provenance.json'), 'utf8')) as Record<string, unknown>;
      writeFileSync(join(root, 'provenance.json'), JSON.stringify({
        ...provenance,
        provenance: { ...(provenance.provenance as object), releaseCommit: 'c'.repeat(40) },
      }));

      expect(codes()).toEqual(['KB_BUNDLE_PROVENANCE_HAS_RELEASE_COMMIT']);
    });

    it('rejects an altered package version that no longer matches the staged tree', () => {
      build({
        provenance: draft => ({
          ...draft,
          packages: draft.packages.map(pkg =>
            pkg.name === '@kb-labs/core-runtime' ? { ...pkg, version: '2.118.0' } : pkg),
        }),
      });
      const found = codes();
      expect(found).toContain('KB_BUNDLE_PACKAGE_VERSION_MISMATCH');
      expect(found).toContain('KB_BUNDLE_GRAPH_VERSION_MISMATCH');
      expect(found).toContain('KB_BUNDLE_PLANNED_VERSION_MISMATCH');
    });

    it('rejects a provenance tree digest that differs from the bundle manifest', () => {
      build({ bundle: draft => ({ ...draft, treeSha256: '9'.repeat(64) }) });
      expect(codes()).toContain('KB_BUNDLE_TREE_MISMATCH');
    });

    it('rejects a releaseId whose version disagrees with the staged tree', () => {
      build({
        provenance: draft => ({ ...draft, releaseId: 'platform-2.118.0' }),
      });
      expect(codes()).toContain('KB_BUNDLE_RELEASE_ID_VERSION_MISMATCH');
    });

    it('rejects tampered release-index bytes', () => {
      build();
      tamperBytes(join(root, 'release-index.json'));
      const found = codes();
      expect(found).toContain('KB_BUNDLE_HASH_MISMATCH');
      expect(found).toContain('KB_BUNDLE_INDEX_HASH_MISMATCH');
    });
  });

  describe('rule 4 — compatibility graph', () => {
    it('rejects a dangling edge', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            edges: [...draft.graph.edges, {
              from: `package:@kb-labs/plugin-release@${GOLDEN_PLATFORM_VERSION}`,
              to: 'package:@kb-labs/ghost@1.0.0',
              kind: 'requires' as const,
              range: '^1.0.0',
            }],
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_DANGLING_EDGE');
    });

    it('rejects an edge whose range the shipped version does not satisfy', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            edges: draft.graph.edges.map(edge =>
              edge.range === '^1.4.0' ? { ...edge, range: '^2.0.0' } : edge),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_EDGE_UNSATISFIED');
    });

    it('rejects an unresolvable platform profile member', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            profiles: draft.graph.profiles.map(profile =>
              profile.id === 'linux-amd64'
                ? { ...profile, members: [...profile.members, 'package:@kb-labs/absent@1.0.0'] }
                : profile),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_PROFILE_MEMBER_UNRESOLVED');
    });

    it('rejects an unresolvable platform profile provider', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            profiles: draft.graph.profiles.map(profile =>
              profile.id === 'linux-amd64'
                ? { ...profile, providers: ['binary:kb-create@0.0.1:linux/amd64'] }
                : profile),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_PROFILE_PROVIDER_UNRESOLVED');
    });
  });

  describe('rule 5 — closed inventory', () => {
    it('rejects an unlisted file present on disk', () => {
      build();
      writeFileSync(join(root, 'npm/kb-labs-sneaky.tgz'), 'not-in-the-manifest');
      const report = verifyBundleDirectory(root);

      expect(report.ok).toBe(false);
      expect(report.diagnostics).toContainEqual(expect.objectContaining({
        code: 'KB_BUNDLE_UNLISTED_FILE',
        subject: 'npm/kb-labs-sneaky.tgz',
      }));
    });

    it('rejects a mandatory file that the inventory omits', () => {
      build({ bundle: draft => ({ ...draft, files: draft.files.filter(file => file.path !== 'release-index.json') }) });
      const found = codes();
      expect(found).toContain('KB_BUNDLE_MANDATORY_FILE_UNLISTED');
      expect(found).toContain('KB_BUNDLE_UNLISTED_FILE');
    });

    it('fails fast when provenance.json is absent', () => {
      build({ omitFromDisk: ['provenance.json'] });
      expect(codes()).toEqual(['KB_BUNDLE_PROVENANCE_MISSING']);
    });

    it('fails fast when bundle.json is absent', () => {
      expect(codes()).toEqual(['KB_BUNDLE_MANIFEST_MISSING']);
    });

    it('fails fast when the bundle directory does not exist', () => {
      expect(codes(join(root, 'nope'))).toEqual(['KB_BUNDLE_DIR_MISSING']);
    });
  });

  describe('rule 6 — mandatory package classification', () => {
    it('rejects a planned package the bundle silently skipped', () => {
      build({
        provenance: draft => ({
          ...draft,
          plannedPackages: [...draft.plannedPackages, { name: '@kb-labs/forgotten', version: GOLDEN_PLATFORM_VERSION }],
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_PACKAGE_UNCLASSIFIED');
    });

    it('rejects a package the bundle ships that was never planned', () => {
      build({
        provenance: draft => ({
          ...draft,
          packages: [...draft.packages, {
            name: '@kb-labs/stowaway',
            version: GOLDEN_PLATFORM_VERSION,
            classification: 'deliveryOnly' as const,
            tarball: null,
            sha256: null,
          }],
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_PACKAGE_NOT_PLANNED');
    });

    it('rejects a deliveryOnly package that nevertheless carries a tarball', () => {
      build({
        provenance: draft => ({
          ...draft,
          packages: draft.packages.map(pkg =>
            pkg.classification === 'deliveryOnly'
              ? { ...pkg, tarball: 'npm/kb-labs-sdk.tgz', sha256: sha256('x') }
              : pkg),
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_DELIVERY_ONLY_HAS_TARBALL');
    });

    it('rejects an unknown classification outright at the schema boundary', () => {
      build();
      const provenance = JSON.parse(readFileSync(join(root, 'provenance.json'), 'utf8')) as {
        packages: Array<Record<string, unknown>>;
      };
      provenance.packages[0]!.classification = 'mystery';
      writeFileSync(join(root, 'provenance.json'), JSON.stringify(provenance));

      expect(codes()).toEqual(['KB_BUNDLE_PROVENANCE_INVALID']);
    });
  });

  describe('rule 7 — one shared SemVer implementation', () => {
    it('rejects an invalid SemVer range instead of guessing at it', () => {
      build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            edges: draft.graph.edges.map(edge =>
              edge.range === '^1.4.0' ? { ...edge, range: 'not-a-range' } : edge),
          },
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_INVALID_RANGE');
    });

    it('accepts the full standard range grammar the plan relies on', () => {
      const digest = build({
        provenance: draft => ({
          ...draft,
          graph: {
            ...draft.graph,
            edges: draft.graph.edges.map(edge =>
              edge.range === '^1.4.0' ? { ...edge, range: '>=1.2.0 <2.0.0 || 1.4.x' } : edge),
          },
        }),
      });
      expect(verifyBundleDirectory(root, digest).ok).toBe(true);
    });

    it('rejects a non-SemVer package version', () => {
      build({
        provenance: draft => ({
          ...draft,
          plannedPackages: draft.plannedPackages.map(entry =>
            entry.name === '@kb-labs/legacy-shim' ? { ...entry, version: 'v2' } : entry),
          packages: draft.packages.map(pkg =>
            pkg.name === '@kb-labs/legacy-shim' ? { ...pkg, version: 'v2' } : pkg),
        }),
      });
      expect(codes()).toContain('KB_BUNDLE_PACKAGE_VERSION_INVALID');
    });
  });
});
