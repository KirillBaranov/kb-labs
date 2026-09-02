/**
 * Compatibility-graph construction for `provenance.json`.
 *
 * The graph is what bundle verification rules 2 and 4 are checked against: every
 * shipped binary must have a node for its exact `{id, version, os, arch}`, every
 * edge must resolve, and every platform profile must be satisfiable from nodes
 * this bundle actually ships. Building it here — from the same classified
 * package list and binary set the index was built from — is what keeps the two
 * documents from drifting apart.
 *
 * SemVer ranges are produced with the shared implementation only (rule 7).
 */

import {
  releaseGraphNodeKey,
  type ReleaseCompatibilityGraph,
  type ReleasePackageClassification,
} from '@kb-labs/release-manager-contracts';
import semver from 'semver';

import type { NormalizedBinary } from './binary-manifest.js';

export interface GraphPackage {
  name: string;
  version: string;
  classification: ReleasePackageClassification;
}

export interface BuildCompatibilityGraphInput {
  packages: GraphPackage[];
  binaries: Array<Pick<NormalizedBinary, 'id' | 'os' | 'arch'> & { version: string }>;
  platformPackage: string;
  platformVersion: string;
  /** The SDK's declared peer range on the platform — the real compatibility edge. */
  sdkPeerRange: string;
  sdkPackage: string;
  sdkVersion: string;
  /** Packages that must be installable together with the platform. */
  memberPackages: string[];
}

/** Nodes exist for every package on a compatibility line; `deliveryOnly` has none by definition. */
const GRAPHED = new Set<ReleasePackageClassification>(['platform', 'member', 'sdk', 'plugin', 'adapter']);

function exactRange(version: string): string {
  const parsed = semver.parse(version);
  if (!parsed) { throw new Error(`cannot build a compatibility range from non-SemVer version ${version}`); }
  return parsed.format();
}

export function buildCompatibilityGraph(input: BuildCompatibilityGraphInput): ReleaseCompatibilityGraph {
  const graphed = input.packages
    .filter(pkg => GRAPHED.has(pkg.classification))
    .sort((left, right) => left.name.localeCompare(right.name));

  const nodes: ReleaseCompatibilityGraph['nodes'] = graphed.map(pkg => ({
    id: pkg.name,
    kind: 'package' as const,
    version: pkg.version,
  }));

  const binaries = [...input.binaries].sort((left, right) =>
    `${left.id}:${left.os}/${left.arch}`.localeCompare(`${right.id}:${right.os}/${right.arch}`));

  for (const binary of binaries) {
    nodes.push({ id: binary.id, kind: 'binary', version: binary.version, os: binary.os, arch: binary.arch });
  }

  const packageNode = (name: string, version: string): string =>
    releaseGraphNodeKey({ id: name, kind: 'package', version });
  const platformKey = packageNode(input.platformPackage, input.platformVersion);

  if (semver.validRange(input.sdkPeerRange) === null) {
    throw new Error(`sdk peer range is not a valid SemVer range: ${input.sdkPeerRange}`);
  }

  const edges: ReleaseCompatibilityGraph['edges'] = [];

  // The SDK's peer range is the one genuinely declared constraint between the
  // two version lines; everything else on the platform line ships lockstep, so
  // its edges pin the exact shipped version rather than inventing a range.
  edges.push({
    from: packageNode(input.sdkPackage, input.sdkVersion),
    to: platformKey,
    kind: 'requires',
    range: input.sdkPeerRange,
  });

  for (const pkg of graphed) {
    if (pkg.name === input.platformPackage || pkg.name === input.sdkPackage) { continue; }
    edges.push({
      from: packageNode(pkg.name, pkg.version),
      to: platformKey,
      kind: 'requires',
      range: exactRange(input.platformVersion),
    });
  }

  for (const binary of binaries) {
    edges.push({
      from: releaseGraphNodeKey({ id: binary.id, kind: 'binary', version: binary.version, os: binary.os, arch: binary.arch }),
      to: platformKey,
      kind: 'provides',
      range: exactRange(input.platformVersion),
    });
  }

  // One profile per shipped binary target: a profile is "what a consumer on this
  // os/arch installs", so its providers are that target's binaries and its
  // members are every package on the platform line plus the SDK.
  const memberKeys = graphed
    .filter(pkg => pkg.classification !== 'deliveryOnly')
    .filter(pkg => input.memberPackages.length === 0
      || pkg.name === input.platformPackage
      || pkg.name === input.sdkPackage
      || input.memberPackages.includes(pkg.name)
      || pkg.classification === 'plugin'
      || pkg.classification === 'adapter'
      || pkg.classification === 'member')
    .map(pkg => packageNode(pkg.name, pkg.version));

  const targets = [...new Set(binaries.map(binary => `${binary.os}-${binary.arch}`))].sort();
  const profiles: ReleaseCompatibilityGraph['profiles'] = targets.map(target => ({
    id: target,
    members: memberKeys,
    providers: binaries
      .filter(binary => `${binary.os}-${binary.arch}` === target)
      .map(binary => releaseGraphNodeKey({
        id: binary.id, kind: 'binary', version: binary.version, os: binary.os, arch: binary.arch,
      })),
  }));

  return { nodes, edges, profiles };
}
