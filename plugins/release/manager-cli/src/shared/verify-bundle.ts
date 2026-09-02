/**
 * Sealed-bundle verification — the seven rules of cutover plan §6A.2.
 *
 * This is pure validation over an already-produced bundle directory: it never
 * writes, never regenerates and never repairs. It exists because every later
 * stage of the control plane (approval over `bundleSha256`, CI delivery of
 * exact bytes, launcher resolution of an immutable descriptor) trusts the
 * bundle completely, so this is the only place an inconsistency can still be
 * caught cheaply.
 *
 * It reports *every* violation it finds rather than throwing on the first one:
 * an operator staring at a rejected release needs the whole picture, not a
 * bisect loop through one diagnostic per run.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import {
  ReleaseBundleProvenanceSchema,
  ReleaseBundleSchema,
  canonicalSha256,
  releaseGraphNodeKey,
  type ReleaseBundle,
  type ReleaseBundleProvenance,
} from '@kb-labs/release-manager-contracts';
import semver from 'semver';

/** The bundle manifest itself is not part of its own closed inventory. */
export const BUNDLE_MANIFEST_FILE = 'bundle.json';
export const BUNDLE_PROVENANCE_FILE = 'provenance.json';

export type BundleRule = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BundleDiagnostic {
  /** Rule number from cutover plan §6A.2 — keeps a failure traceable to the norm. */
  rule: BundleRule;
  code: string;
  message: string;
  subject?: string;
}

export interface BundleVerificationReport {
  ok: boolean;
  bundleDir: string;
  releaseId: string | null;
  candidateId: string | null;
  bundleSha256: string | null;
  counts: {
    files: number;
    packages: number;
    tarballs: number;
    binaries: number;
    nodes: number;
    edges: number;
    profiles: number;
  };
  diagnostics: BundleDiagnostic[];
}

const EMPTY_COUNTS: BundleVerificationReport['counts'] = {
  files: 0, packages: 0, tarballs: 0, binaries: 0, nodes: 0, edges: 0, profiles: 0,
};

/** Package classifications that ride the platform version line. */
const PLATFORM_LINE = new Set(['platform', 'member', 'plugin', 'adapter']);

function resolveInside(root: string, relativePath: string): string | null {
  const base = resolve(root);
  const candidate = resolve(base, relativePath);
  return candidate === base || candidate.startsWith(`${base}${sep}`) ? candidate : null;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFilesRecursively(root: string, current = root, out: string[] = []): string[] {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = resolve(current, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursively(root, full, out);
    } else if (entry.isFile()) {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

function fatal(bundleDir: string, diagnostic: BundleDiagnostic): BundleVerificationReport {
  return {
    ok: false,
    bundleDir,
    releaseId: null,
    candidateId: null,
    bundleSha256: null,
    counts: { ...EMPTY_COUNTS },
    diagnostics: [diagnostic],
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/**
 * Verifies a sealed bundle directory against all seven rules.
 *
 * `expectedBundleSha256`, when given, is the digest an approval was granted
 * over — checking it here is what stops an approved digest from being swapped
 * for a differently-sealed but internally consistent bundle.
 */
export function verifyBundleDirectory(bundleDir: string, expectedBundleSha256?: string): BundleVerificationReport {
  const root = resolve(bundleDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return fatal(bundleDir, { rule: 5, code: 'KB_BUNDLE_DIR_MISSING', message: `bundle directory not found: ${bundleDir}` });
  }

  const manifestPath = resolveInside(root, BUNDLE_MANIFEST_FILE);
  if (!manifestPath || !existsSync(manifestPath)) {
    return fatal(bundleDir, { rule: 5, code: 'KB_BUNDLE_MANIFEST_MISSING', message: `bundle manifest not found: ${BUNDLE_MANIFEST_FILE}` });
  }

  let rawManifest: unknown;
  let rawProvenance: unknown;
  try {
    rawManifest = readJson(manifestPath);
  } catch (error) {
    return fatal(bundleDir, { rule: 5, code: 'KB_BUNDLE_MANIFEST_UNREADABLE', message: `bundle.json is not valid JSON: ${(error as Error).message}` });
  }

  const manifest = ReleaseBundleSchema.safeParse(rawManifest);
  if (!manifest.success) {
    return fatal(bundleDir, { rule: 5, code: 'KB_BUNDLE_MANIFEST_INVALID', message: `bundle.json does not match kb.release-bundle/1: ${manifest.error.message}` });
  }
  const bundle: ReleaseBundle = manifest.data;

  const provenancePath = resolveInside(root, BUNDLE_PROVENANCE_FILE);
  if (!provenancePath || !existsSync(provenancePath)) {
    return fatal(bundleDir, { rule: 3, code: 'KB_BUNDLE_PROVENANCE_MISSING', message: `bundle provenance not found: ${BUNDLE_PROVENANCE_FILE}` });
  }
  try {
    rawProvenance = readJson(provenancePath);
  } catch (error) {
    return fatal(bundleDir, { rule: 3, code: 'KB_BUNDLE_PROVENANCE_UNREADABLE', message: `provenance.json is not valid JSON: ${(error as Error).message}` });
  }

  // Named ahead of schema parsing so the operator gets the reason, not a generic
  // "unrecognized key". Sealing precedes the release commit; a bundle that
  // records one is describing a tree it cannot have been built from.
  const rawProvenanceBlock = (rawProvenance as { provenance?: Record<string, unknown> } | null)?.provenance;
  if (rawProvenanceBlock && Object.prototype.hasOwnProperty.call(rawProvenanceBlock, 'releaseCommit')) {
    return fatal(bundleDir, {
      rule: 3,
      code: 'KB_BUNDLE_PROVENANCE_HAS_RELEASE_COMMIT',
      message: 'provenance must not contain releaseCommit: the release commit does not exist at sealing time',
    });
  }

  const provenanceParsed = ReleaseBundleProvenanceSchema.safeParse(rawProvenance);
  if (!provenanceParsed.success) {
    return fatal(bundleDir, { rule: 3, code: 'KB_BUNDLE_PROVENANCE_INVALID', message: `provenance.json does not match kb.release-bundle-provenance/1: ${provenanceParsed.error.message}` });
  }
  const provenance: ReleaseBundleProvenance = provenanceParsed.data;

  const diagnostics: BundleDiagnostic[] = [];
  const add = (rule: BundleRule, code: string, message: string, subject?: string): void => {
    diagnostics.push({ rule, code, message, ...(subject === undefined ? {} : { subject }) });
  };

  checkManifestDigest(bundle, expectedBundleSha256, add);
  const onDisk = checkInventory(root, bundle, provenance, add);
  checkNpmArtifacts(bundle, provenance, onDisk, add);
  checkBinaries(root, bundle, provenance, add);
  checkVersionConsistency(root, bundle, provenance, add);
  checkGraph(provenance, add);
  checkClassification(provenance, add);

  return {
    ok: diagnostics.length === 0,
    bundleDir: root,
    releaseId: bundle.releaseId,
    candidateId: bundle.candidateId,
    bundleSha256: bundle.bundleSha256,
    counts: {
      files: bundle.files.length,
      packages: provenance.packages.length,
      tarballs: provenance.packages.filter(pkg => pkg.tarball !== null).length,
      binaries: provenance.binaries.length,
      nodes: provenance.graph.nodes.length,
      edges: provenance.graph.edges.length,
      profiles: provenance.graph.profiles.length,
    },
    diagnostics,
  };
}

type Add = (rule: BundleRule, code: string, message: string, subject?: string) => void;

function checkManifestDigest(bundle: ReleaseBundle, expected: string | undefined, add: Add): void {
  const recomputed = canonicalSha256({ ...bundle, bundleSha256: '' });
  if (bundle.bundleSha256 !== recomputed) {
    add(3, 'KB_BUNDLE_DIGEST_SELF_MISMATCH', `bundleSha256 ${bundle.bundleSha256} does not match its canonical payload ${recomputed}`);
  }
  if (expected && bundle.bundleSha256 !== expected) {
    add(3, 'KB_BUNDLE_DIGEST_MISMATCH', `bundle digest mismatch: expected ${expected}, got ${bundle.bundleSha256}`);
  }
}

/** Rule 5: closed inventory — nothing unlisted on disk, nothing listed that is missing. */
function checkInventory(root: string, bundle: ReleaseBundle, provenance: ReleaseBundleProvenance, add: Add): Set<string> {
  const listed = new Map<string, { sha256: string; size: number }>();
  for (const file of bundle.files) {
    if (listed.has(file.path)) {
      add(5, 'KB_BUNDLE_DUPLICATE_INVENTORY_ENTRY', `inventory lists ${file.path} more than once`, file.path);
      continue;
    }
    listed.set(file.path, { sha256: file.sha256, size: file.size });
  }

  const present = new Set(listFilesRecursively(root));
  const verified = new Set<string>();

  for (const [path, expected] of listed) {
    const full = resolveInside(root, path);
    if (!full) {
      add(5, 'KB_BUNDLE_PATH_ESCAPE', `inventory entry escapes the bundle directory: ${path}`, path);
      continue;
    }
    if (!present.has(path)) {
      add(5, 'KB_BUNDLE_FILE_MISSING', `inventory lists a file that is not on disk: ${path}`, path);
      continue;
    }
    const stats = statSync(full);
    if (stats.size !== expected.size) {
      add(5, 'KB_BUNDLE_SIZE_MISMATCH', `size mismatch for ${path}: manifest ${expected.size}, disk ${stats.size}`, path);
      continue;
    }
    if (sha256File(full) !== expected.sha256) {
      add(1, 'KB_BUNDLE_HASH_MISMATCH', `checksum mismatch for ${path}`, path);
      continue;
    }
    verified.add(path);
  }

  for (const path of present) {
    // The manifest cannot list its own digest without a fixed point, so it is
    // the one deliverable excluded from the closed inventory.
    if (path === BUNDLE_MANIFEST_FILE) { continue; }
    if (!listed.has(path)) {
      add(5, 'KB_BUNDLE_UNLISTED_FILE', `deliverable file on disk is not listed in the bundle inventory: ${path}`, path);
    }
  }

  for (const mandatory of [BUNDLE_PROVENANCE_FILE, provenance.index.path]) {
    if (!listed.has(mandatory)) {
      add(5, 'KB_BUNDLE_MANDATORY_FILE_UNLISTED', `mandatory bundle file is not listed in the inventory: ${mandatory}`, mandatory);
    }
  }

  return verified;
}

/** Rule 1: every npm manifest item ↔ exactly one tarball, with a matching hash. */
function checkNpmArtifacts(
  bundle: ReleaseBundle,
  provenance: ReleaseBundleProvenance,
  verified: Set<string>,
  add: Add,
): void {
  const listedByPath = new Map(bundle.files.map(file => [file.path, file] as const));
  const claimed = new Map<string, string>();

  for (const pkg of provenance.packages) {
    if (pkg.classification === 'deliveryOnly') {
      if (pkg.tarball !== null || pkg.sha256 !== null) {
        add(6, 'KB_BUNDLE_DELIVERY_ONLY_HAS_TARBALL', `deliveryOnly package ${pkg.name} must not carry a tarball`, pkg.name);
      }
      continue;
    }
    if (pkg.tarball === null || pkg.sha256 === null) {
      add(1, 'KB_BUNDLE_PACKAGE_WITHOUT_TARBALL', `package ${pkg.name} is classified ${pkg.classification} but has no tarball`, pkg.name);
      continue;
    }

    const previous = claimed.get(pkg.tarball);
    if (previous) {
      add(1, 'KB_BUNDLE_TARBALL_CLAIMED_TWICE', `tarball ${pkg.tarball} is claimed by both ${previous} and ${pkg.name}`, pkg.tarball);
      continue;
    }
    claimed.set(pkg.tarball, pkg.name);

    const entry = listedByPath.get(pkg.tarball);
    if (!entry) {
      add(1, 'KB_BUNDLE_TARBALL_NOT_IN_INVENTORY', `tarball for ${pkg.name} is not listed in the bundle inventory: ${pkg.tarball}`, pkg.tarball);
      continue;
    }
    if (entry.sha256 !== pkg.sha256) {
      add(1, 'KB_BUNDLE_TARBALL_HASH_DISAGREES', `npm manifest hash for ${pkg.name} disagrees with the inventory hash for ${pkg.tarball}`, pkg.tarball);
      continue;
    }
    // The inventory pass hashed the real bytes against this same value, so
    // absence from `verified` means they are missing or corrupt. Restate it
    // under rule 1 so the npm manifest itself is reported as unsatisfied.
    if (!verified.has(pkg.tarball)) {
      add(1, 'KB_BUNDLE_TARBALL_BYTES_UNVERIFIED', `tarball bytes for ${pkg.name} could not be verified`, pkg.tarball);
    }
  }

  for (const file of bundle.files) {
    if (file.path.endsWith('.tgz') && !claimed.has(file.path)) {
      add(1, 'KB_BUNDLE_UNCLAIMED_TARBALL', `tarball ${file.path} is not claimed by any package in the npm manifest`, file.path);
    }
  }
}

/** Rule 2: every selected binary exists, hashes correctly and has an exact graph node. */
function checkBinaries(root: string, bundle: ReleaseBundle, provenance: ReleaseBundleProvenance, add: Add): void {
  const listedByPath = new Map(bundle.files.map(file => [file.path, file] as const));
  const nodeKeys = new Set(provenance.graph.nodes.map(node => releaseGraphNodeKey(node)));
  const seenTargets = new Set<string>();

  for (const binary of provenance.binaries) {
    const target = `${binary.id}:${binary.os}/${binary.arch}`;
    if (seenTargets.has(target)) {
      add(2, 'KB_BUNDLE_DUPLICATE_BINARY_TARGET', `binary target ${target} is selected more than once`, target);
    }
    seenTargets.add(target);

    if (!semver.valid(binary.version)) {
      add(7, 'KB_BUNDLE_BINARY_VERSION_INVALID', `binary ${binary.id} has a non-SemVer version ${binary.version}`, target);
    }

    const entry = listedByPath.get(binary.path);
    if (!entry) {
      add(2, 'KB_BUNDLE_BINARY_NOT_IN_INVENTORY', `binary ${target} is not listed in the bundle inventory: ${binary.path}`, binary.path);
    } else if (entry.sha256 !== binary.sha256) {
      add(2, 'KB_BUNDLE_BINARY_HASH_DISAGREES', `binary hash for ${target} disagrees with the inventory hash`, binary.path);
    } else {
      const full = resolveInside(root, binary.path);
      if (!full || !existsSync(full)) {
        add(2, 'KB_BUNDLE_BINARY_MISSING', `binary ${target} is missing on disk: ${binary.path}`, binary.path);
      } else if (sha256File(full) !== binary.sha256) {
        add(2, 'KB_BUNDLE_BINARY_HASH_MISMATCH', `binary bytes for ${target} do not match the recorded hash`, binary.path);
      }
    }

    const key = releaseGraphNodeKey({ id: binary.id, kind: 'binary', version: binary.version, os: binary.os, arch: binary.arch });
    if (!nodeKeys.has(key)) {
      add(2, 'KB_BUNDLE_BINARY_WITHOUT_GRAPH_NODE', `no compatibility-graph node for binary ${key}`, key);
    }
  }

  for (const node of provenance.graph.nodes) {
    if (node.kind !== 'binary') { continue; }
    const selected = provenance.binaries.some(binary =>
      binary.id === node.id && binary.version === node.version && binary.os === node.os && binary.arch === node.arch);
    if (!selected) {
      add(2, 'KB_BUNDLE_GRAPH_BINARY_NOT_SELECTED', `graph declares binary ${releaseGraphNodeKey(node)} that this bundle does not ship`, releaseGraphNodeKey(node));
    }
  }
}

/**
 * Rule 3: every recorded version and index label must agree with the one staged
 * tree the artifacts were actually built from.
 *
 * This is the rule that catches the real regression the plan calls out: a
 * provenance block reading 2.119 next to a release index still labelled 2.118.
 */
function checkVersionConsistency(root: string, bundle: ReleaseBundle, provenance: ReleaseBundleProvenance, add: Add): void {
  const { versions } = provenance.provenance;

  if (provenance.releaseId !== bundle.releaseId) {
    add(3, 'KB_BUNDLE_RELEASE_ID_MISMATCH', `provenance releaseId ${provenance.releaseId} does not match bundle releaseId ${bundle.releaseId}`);
  }
  if (provenance.candidateId !== bundle.candidateId) {
    add(3, 'KB_BUNDLE_CANDIDATE_ID_MISMATCH', `provenance candidateId ${provenance.candidateId} does not match bundle candidateId ${bundle.candidateId}`);
  }
  if (provenance.provenance.treeSha256 !== bundle.treeSha256) {
    add(3, 'KB_BUNDLE_TREE_MISMATCH', `provenance treeSha256 ${provenance.provenance.treeSha256} does not match bundle treeSha256 ${bundle.treeSha256}`);
  }
  if (provenance.provenance.intentSha256 !== bundle.intentSha256) {
    add(3, 'KB_BUNDLE_INTENT_MISMATCH', 'provenance intentSha256 does not match the bundle intentSha256');
  }
  if (provenance.index.sha256 !== bundle.indexSha256) {
    add(3, 'KB_BUNDLE_INDEX_DIGEST_MISMATCH', 'release index digest in provenance does not match bundle indexSha256');
  }

  const indexPath = resolveInside(root, provenance.index.path);
  if (indexPath && existsSync(indexPath) && sha256File(indexPath) !== provenance.index.sha256) {
    add(3, 'KB_BUNDLE_INDEX_HASH_MISMATCH', `release index bytes do not match the recorded digest: ${provenance.index.path}`, provenance.index.path);
  }

  if (!semver.valid(versions.platform)) {
    add(7, 'KB_BUNDLE_PLATFORM_VERSION_INVALID', `platform version ${versions.platform} is not valid SemVer`);
  }
  if (versions.sdk !== null && !semver.valid(versions.sdk)) {
    add(7, 'KB_BUNDLE_SDK_VERSION_INVALID', `sdk version ${versions.sdk} is not valid SemVer`);
  }

  if (provenance.index.version !== versions.platform) {
    add(3, 'KB_BUNDLE_INDEX_VERSION_MISMATCH', `release index is labelled ${provenance.index.version} but provenance records ${versions.platform}`);
  }

  const suffix = /-(\d+\.\d+\.\d+(?:[-+].*)?)$/.exec(bundle.releaseId);
  if (suffix && suffix[1] !== versions.platform) {
    add(3, 'KB_BUNDLE_RELEASE_ID_VERSION_MISMATCH', `releaseId ${bundle.releaseId} disagrees with the provenance platform version ${versions.platform}`);
  }

  for (const pkg of provenance.packages) {
    if (!semver.valid(pkg.version)) {
      add(7, 'KB_BUNDLE_PACKAGE_VERSION_INVALID', `package ${pkg.name} has a non-SemVer version ${pkg.version}`, pkg.name);
      continue;
    }
    if (PLATFORM_LINE.has(pkg.classification) && pkg.version !== versions.platform) {
      add(3, 'KB_BUNDLE_PACKAGE_VERSION_MISMATCH', `package ${pkg.name} is ${pkg.version} but the staged tree records platform ${versions.platform}`, pkg.name);
    }
    if (pkg.classification === 'sdk') {
      if (versions.sdk === null) {
        add(3, 'KB_BUNDLE_SDK_VERSION_MISSING', `package ${pkg.name} is classified sdk but provenance records no sdk version`, pkg.name);
      } else if (pkg.version !== versions.sdk) {
        add(3, 'KB_BUNDLE_PACKAGE_VERSION_MISMATCH', `sdk package ${pkg.name} is ${pkg.version} but the staged tree records sdk ${versions.sdk}`, pkg.name);
      }
    }
  }

  const graphPackageVersions = new Map<string, string>();
  for (const node of provenance.graph.nodes) {
    if (node.kind === 'package') { graphPackageVersions.set(node.id, node.version); }
  }
  for (const pkg of provenance.packages) {
    const graphVersion = graphPackageVersions.get(pkg.name);
    if (graphVersion !== undefined && graphVersion !== pkg.version) {
      add(3, 'KB_BUNDLE_GRAPH_VERSION_MISMATCH', `graph node for ${pkg.name} is ${graphVersion} but the npm manifest ships ${pkg.version}`, pkg.name);
    }
  }
}

/** Rules 4 and 7: no dangling edge, no unresolvable profile, SemVer via the shared implementation. */
function checkGraph(provenance: ReleaseBundleProvenance, add: Add): void {
  const nodesByKey = new Map<string, { id: string; version: string }>();
  for (const node of provenance.graph.nodes) {
    const key = releaseGraphNodeKey(node);
    if (nodesByKey.has(key)) {
      add(4, 'KB_BUNDLE_DUPLICATE_GRAPH_NODE', `compatibility graph declares node ${key} more than once`, key);
      continue;
    }
    if (node.kind === 'binary' && (node.os === undefined || node.arch === undefined)) {
      add(2, 'KB_BUNDLE_BINARY_NODE_UNTARGETED', `binary node ${node.id} must declare both os and arch`, node.id);
    }
    if (!semver.valid(node.version)) {
      add(7, 'KB_BUNDLE_NODE_VERSION_INVALID', `graph node ${key} has a non-SemVer version`, key);
    }
    nodesByKey.set(key, { id: node.id, version: node.version });
  }

  for (const edge of provenance.graph.edges) {
    const from = nodesByKey.get(edge.from);
    const to = nodesByKey.get(edge.to);
    if (!from) {
      add(4, 'KB_BUNDLE_DANGLING_EDGE', `compatibility edge origin does not exist: ${edge.from}`, edge.from);
    }
    if (!to) {
      add(4, 'KB_BUNDLE_DANGLING_EDGE', `compatibility edge target does not exist: ${edge.to}`, edge.to);
    }
    if (semver.validRange(edge.range) === null) {
      add(7, 'KB_BUNDLE_INVALID_RANGE', `compatibility edge ${edge.from} -> ${edge.to} has an invalid SemVer range "${edge.range}"`, edge.range);
      continue;
    }
    if (to && !semver.satisfies(to.version, edge.range, { includePrerelease: true })) {
      add(4, 'KB_BUNDLE_EDGE_UNSATISFIED', `${edge.from} requires ${edge.to} in "${edge.range}" but the shipped version is ${to.version}`, edge.to);
    }
  }

  for (const profile of provenance.graph.profiles) {
    for (const member of profile.members) {
      if (!nodesByKey.has(member)) {
        add(4, 'KB_BUNDLE_PROFILE_MEMBER_UNRESOLVED', `platform profile ${profile.id} selects a member with no graph node: ${member}`, profile.id);
      }
    }
    for (const provider of profile.providers) {
      if (!nodesByKey.has(provider)) {
        add(4, 'KB_BUNDLE_PROFILE_PROVIDER_UNRESOLVED', `platform profile ${profile.id} selects a provider with no graph node: ${provider}`, profile.id);
      }
    }
  }
}

/** Rule 6: every planned package is classified — no unknown, no silently skipped. */
function checkClassification(provenance: ReleaseBundleProvenance, add: Add): void {
  const classified = new Map<string, string>();
  for (const pkg of provenance.packages) {
    if (classified.has(pkg.name)) {
      add(6, 'KB_BUNDLE_DUPLICATE_PACKAGE', `package ${pkg.name} is classified more than once`, pkg.name);
      continue;
    }
    classified.set(pkg.name, pkg.version);
  }

  const planned = new Map<string, string>();
  for (const entry of provenance.plannedPackages) {
    planned.set(entry.name, entry.version);
  }

  for (const [name, version] of planned) {
    const shipped = classified.get(name);
    if (shipped === undefined) {
      add(6, 'KB_BUNDLE_PACKAGE_UNCLASSIFIED', `planned package ${name} was silently skipped: it has no classification in this bundle`, name);
    } else if (shipped !== version) {
      add(3, 'KB_BUNDLE_PLANNED_VERSION_MISMATCH', `planned package ${name} was planned at ${version} but the bundle ships ${shipped}`, name);
    }
  }

  for (const name of classified.keys()) {
    if (!planned.has(name)) {
      add(6, 'KB_BUNDLE_PACKAGE_NOT_PLANNED', `bundle ships ${name}, which is not in the planned package set`, name);
    }
  }
}
