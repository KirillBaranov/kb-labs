/**
 * Release-index generation — the domain logic migrated out of the CI-owned
 * `tools/kb-create/scripts/prepare-release-index.mjs` (execution plan PR 3
 * item 2). That script is deleted in the same change so no CI-owned duplicate
 * survives.
 *
 * What this module produces is the *normalized export*: the complete, validated
 * description of a release from its exact staged tarballs. Sealing that export
 * into the immutable `kb.create.release-index/v2` document (schema stamp,
 * catalog validation, digest) stays with `kb-create`'s
 * `kb-create-release-index` binary, which owns that format and is the thing the
 * launcher validates against — see `sealReleaseIndex` in `./seal.ts`.
 *
 * Two changes from the script are deliberate:
 *
 * - SemVer comes from the shared `semver` implementation. The script carried
 *   its own `satisfies`/`compareToken`/`parseVersion` trio, which bundle
 *   verification rule 7 explicitly outlaws.
 * - Package classification is emitted alongside the index, because bundle
 *   verification rule 6 requires every planned package to be classified rather
 *   than silently carried along.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ReleaseCompatibilityGraph,
  ReleasePackageClassification,
} from '@kb-labs/release-manager-contracts';
import semver from 'semver';

import {
  extractTarball,
  readPackageJson,
  readPackageManifest,
  type PackageManifest,
} from './artifact-manifest.js';
import type { NormalizedBinary } from './binary-manifest.js';
import { buildCompatibilityGraph } from './graph.js';

/**
 * Schema stamp for the compatibility graph carried by the export.
 *
 * It must stay byte-identical to `catalog.CompatibilityGraphSchema` in
 * `tools/kb-create/v2/catalog/graph.go`: the Go reader rejects any other value
 * outright, since there is no legacy graph reader.
 */
export const RELEASE_COMPATIBILITY_GRAPH_SCHEMA = 'kb.release-compatibility/3';

export interface StagedArtifactRef {
  name: string;
  version: string;
  /** Absolute path of the packed tarball. */
  tarball: string;
  sha256: string;
}

export interface ReleaseIndexOptions {
  /**
   * The release this index describes. It replaces the old `channels` map: a
   * channel is an externally resolved pointer at the descriptor layer, never a
   * field a sealed, immutable index can rewrite.
   */
  releaseId: string;
  registry?: string;
  platformPackage?: string;
  sdkPackage?: string;
  /** Overrides the platform version derived from the staged platform package. */
  platformVersion?: string;
  sdkVersion?: string;
  binaries?: NormalizedBinary[];
  /** Capabilities the platform requires from adapters at install time. */
  platformRequires?: string[];
  platformAdapterConfig?: Record<string, string>;
  platformAdapterOptions?: Record<string, unknown>;
  /** Packages that must travel with the platform even without a service manifest. */
  platformMemberPackages?: string[];
  /** Manifests for packages whose tarball carries none, keyed by package name. */
  adapterOverrides?: Record<string, PackageManifest>;
  /** Working directory for tarball extraction; created and cleaned by the caller. */
  workDir: string;
}

export interface ReleaseIndexComponent {
  id: string;
  version: string;
  package: string;
  tarball: string;
  sha256: string;
  config: unknown[];
}

export interface ReleaseIndexExport {
  releaseId: string;
  /**
   * The compatibility *graph* — the same object that lands in
   * `provenance.json`, plus the schema stamp the Go catalog reader requires.
   * Version 2's flat label matrix is gone in both languages.
   */
  compatibility: ReleaseCompatibilityGraph & { schema: typeof RELEASE_COMPATIBILITY_GRAPH_SCHEMA };
  platforms: Array<Record<string, unknown>>;
  sdks: ReleaseIndexComponent[];
  plugins: Array<ReleaseIndexComponent & { requires: Array<{ capability: string; requiredBy: string }> }>;
  adapters: Array<ReleaseIndexComponent & { provides: string[] }>;
}

export interface ClassifiedPackage {
  name: string;
  version: string;
  classification: ReleasePackageClassification;
}

export interface BuildReleaseIndexResult {
  export: ReleaseIndexExport;
  /** Staging root of extracted package manifests, consumed by the index sealer. */
  manifestRoot: string;
  platformVersion: string;
  sdkVersion: string;
  /**
   * The compatibility graph the export carries, handed back unstamped so
   * `provenance.json` records the very same object rather than recomputing a
   * second graph that could drift from the sealed one.
   */
  graph: ReleaseCompatibilityGraph;
  /** The SDK's declared peer range on the platform — the one real constraint. */
  sdkPeerRange: string;
  classifications: ClassifiedPackage[];
  services: Array<{ id: string; packageName: string; command: string; port: number; dependsOn: string[]; required: true }>;
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_PLATFORM_PACKAGE = '@kb-labs/core-runtime';
const DEFAULT_SDK_PACKAGE = '@kb-labs/sdk';

function idFor(packageName: string): string {
  return packageName.split('/').pop()!.replace(/-entry$/, '');
}

function tarballUrl(registry: string, item: StagedArtifactRef): string {
  const base = item.name.split('/').pop();
  return `${registry.replace(/\/$/, '')}/${item.name}/-/${base}-${item.version}.tgz`;
}

/**
 * Resolves a configured adapter package (possibly a subpath export such as
 * `@scope/adapters-sqlite/kv`) back to the staged package that provides it.
 *
 * Fails closed: an adapter named in the sealed platform configuration that the
 * release did not actually produce would leave a fresh install pointing at a
 * package that does not exist at this version.
 */
function stagedPackageForAdapter(configuredPackage: string, staged: StagedArtifactRef[]): string {
  const matches = staged
    .filter(item => configuredPackage === item.name || configuredPackage.startsWith(`${item.name}/`))
    .sort((left, right) => right.name.length - left.name.length);
  if (matches.length === 0) {
    throw new Error(`configured platform adapter ${configuredPackage} is absent from stage manifest`);
  }
  return matches[0]!.name;
}

/**
 * A release index is a portable installation baseline, not a copy of the
 * maintainer's development environment. Only the transport needed to reach the
 * installed service graph is enabled by default; remote providers and their
 * credentials belong in a consumer overlay, or a fresh CLI can fail before it
 * is even able to configure that overlay.
 */
function portable<T extends Record<string, unknown>>(config: T | undefined): { serviceTransport: unknown } | undefined {
  return config?.serviceTransport ? { serviceTransport: config.serviceTransport } : undefined;
}

function classify(
  name: string,
  platformPackage: string,
  sdkPackage: string,
  manifest: PackageManifest | undefined,
  memberPackages: Set<string>,
): ReleasePackageClassification {
  if (name === platformPackage) { return 'platform'; }
  if (name === sdkPackage) { return 'sdk'; }
  if (manifest?.schema === 'kb.plugin/3') { return 'plugin'; }
  if (manifest?.schema === 'kb.adapter/1') { return 'adapter'; }
  if (manifest?.schema === 'kb.service/1' || memberPackages.has(name)) { return 'member'; }
  // Rule 6's escape hatch: shipped, but on no compatibility line. Stated
  // explicitly rather than left unclassified.
  return 'deliveryOnly';
}

export function buildReleaseIndex(
  staged: StagedArtifactRef[],
  options: ReleaseIndexOptions,
): BuildReleaseIndexResult {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const platformPackage = options.platformPackage ?? DEFAULT_PLATFORM_PACKAGE;
  const sdkPackage = options.sdkPackage ?? DEFAULT_SDK_PACKAGE;

  if (staged.length === 0) { throw new Error('stage manifest contains no artifacts'); }
  if (new Set(staged.map(item => item.name)).size !== staged.length) {
    throw new Error('stage manifests contain duplicate package names');
  }

  const byName = new Map(staged.map(item => [item.name, item] as const));
  const platform = byName.get(platformPackage);
  if (!platform) { throw new Error(`platform package ${platformPackage} is absent from stage manifest`); }

  const configuredAdapterPackages = options.platformAdapterConfig
    ? [...new Set(Object.values(options.platformAdapterConfig).map(configured => {
      if (typeof configured !== 'string' || configured.length === 0) {
        throw new Error('platform adapter configuration must contain package strings');
      }
      return stagedPackageForAdapter(configured, staged);
    }))]
    : [];

  const memberPackages = options.platformMemberPackages ?? [];
  for (const name of memberPackages) {
    if (!byName.has(name)) { throw new Error(`required platform member ${name} is absent from stage manifest`); }
  }

  const platformVersion = options.platformVersion ?? platform.version;
  if (platform.version !== platformVersion) {
    throw new Error(`platform version mismatch: stage=${platform.version}, expected=${platformVersion}`);
  }
  if (!semver.valid(platformVersion)) {
    throw new Error(`platform version ${platformVersion} is not valid SemVer`);
  }

  const sdk = byName.get(sdkPackage);
  if (!sdk) {
    throw new Error(`SDK package ${sdkPackage} is absent from stage manifest; compatibility cannot be validated without an exact SDK artifact`);
  }
  if (options.sdkVersion && sdk.version !== options.sdkVersion) {
    throw new Error(`SDK version mismatch for ${sdkPackage}`);
  }

  const binaries = (options.binaries ?? []).map(binary => ({ ...binary, version: platformVersion }));

  // Extraction root. Recreated from scratch so a previous run's manifests can
  // never leak into this index.
  const manifestRoot = join(options.workDir, 'index-manifest-root');
  rmSync(manifestRoot, { recursive: true, force: true });
  mkdirSync(manifestRoot, { recursive: true });

  const portableAdapterConfig = portable(options.platformAdapterConfig);
  const portableAdapterOptions = portable(options.platformAdapterOptions);

  const services: BuildReleaseIndexResult['services'] = [];
  const plugins: ReleaseIndexExport['plugins'] = [];
  const adapters: ReleaseIndexExport['adapters'] = [];
  const classifications: ClassifiedPackage[] = [];
  const memberSet = new Set(memberPackages);
  const packageDirs = new Map<string, string>();

  const component = (item: StagedArtifactRef, id = idFor(item.name)): ReleaseIndexComponent => ({
    id,
    version: item.version,
    package: item.name,
    tarball: tarballUrl(registry, item),
    sha256: item.sha256,
    config: [],
  });

  for (const item of staged) {
    const packageDir = join(manifestRoot, 'node_modules', ...item.name.split('/'));
    extractTarball(item.tarball, packageDir);
    packageDirs.set(item.name, packageDir);

    const manifest = readPackageManifest(packageDir) ?? options.adapterOverrides?.[item.name];
    classifications.push({
      name: item.name,
      version: item.version,
      classification: classify(item.name, platformPackage, sdkPackage, manifest, memberSet),
    });

    const normalizedId = item.name === platformPackage
      ? 'platform'
      : item.name === sdkPackage
        ? 'sdk'
        : manifest?.schema === 'kb.service/1' || manifest?.schema === 'kb.adapter/1'
          ? manifest.id
          : idFor(item.name);

    const generatedRequirements = item.name === platformPackage
      ? [
        ...(portableAdapterConfig ? [{ id: 'platform.adapters', path: '/platform/adapters', default: portableAdapterConfig }] : []),
        ...(portableAdapterOptions ? [{ id: 'platform.adapterOptions', path: '/platform/adapterOptions', default: portableAdapterOptions }] : []),
      ]
      : [];

    writeFileSync(join(packageDir, 'kb-create.manifest.json'), `${JSON.stringify({
      schema: 'kb.create.artifact-manifest/v2',
      id: normalizedId,
      package: item.name,
      version: item.version,
      requirements: [
        ...(manifest?.schema === 'kb.create.artifact-manifest/v2' ? manifest.requirements ?? [] : []),
        ...generatedRequirements,
      ],
    })}\n`);

    if (!manifest) { continue; }

    if (manifest.schema === 'kb.service/1') {
      const packageJson = readPackageJson(packageDir) as { bin?: Record<string, string> };
      services.push({
        id: manifest.id,
        packageName: item.name,
        command: manifest.bin
          ? Object.keys(manifest.bin)[0]!
          : Object.keys(packageJson.bin ?? {})[0] ?? item.name.split('/').pop()!,
        port: manifest.runtime?.port ?? 0,
        dependsOn: manifest.dependsOn ?? [],
        required: true,
      });
    } else if (manifest.schema === 'kb.plugin/3') {
      const requires = (manifest.platform?.requires ?? []).map(capability => ({ capability, requiredBy: idFor(item.name) }));
      plugins.push({ ...component(item, idFor(item.name)), requires });
    } else if (manifest.schema === 'kb.adapter/1') {
      const capabilities = (Array.isArray(manifest.implements) ? manifest.implements : [manifest.implements])
        .filter(Boolean)
        .map(capability => capability.replace(/^I/, '').replace(/[A-Z]/g, letter => letter.toLowerCase()));
      adapters.push({ ...component(item, manifest.id ?? idFor(item.name)), provides: capabilities });
    }
  }

  // The SDK's own peer range is the authoritative compatibility statement
  // between the two version lines, so it is validated against the exact staged
  // platform rather than assumed from a shared major.
  const sdkPackageJson = readPackageJson(packageDirs.get(sdk.name)!) as {
    peerDependencies?: Record<string, string>;
  };
  const sdkPlatformRange = sdkPackageJson.peerDependencies?.[platformPackage];
  if (!sdkPlatformRange) {
    throw new Error(`${sdkPackage} does not declare a peer dependency on ${platformPackage}`);
  }
  if (semver.validRange(sdkPlatformRange) === null) {
    throw new Error(`${sdkPackage} declares an invalid SemVer range for ${platformPackage}: ${sdkPlatformRange}`);
  }
  if (!semver.satisfies(platformVersion, sdkPlatformRange, { includePrerelease: true })) {
    throw new Error(`${sdkPackage}@${sdk.version} rejects ${platformPackage}@${platformVersion}: ${sdkPlatformRange}`);
  }

  // One graph, built once, from the classifications and binaries this very
  // index was built from. `provenance.json` gets the same object back through
  // the result, so the sealed index and the bundle's provenance cannot drift.
  const graph = buildCompatibilityGraph({
    packages: classifications,
    binaries: binaries.map(binary => ({
      id: binary.id, os: binary.os, arch: binary.arch, version: platformVersion,
    })),
    platformPackage,
    platformVersion,
    sdkPackage,
    sdkVersion: sdk.version,
    sdkPeerRange: sdkPlatformRange,
    memberPackages,
  });

  const indexExport: ReleaseIndexExport = {
    releaseId: options.releaseId,
    compatibility: { schema: RELEASE_COMPATIBILITY_GRAPH_SCHEMA, ...graph },
    platforms: [{
      id: 'platform',
      version: platformVersion,
      package: platform.name,
      tarball: tarballUrl(registry, platform),
      sha256: platform.sha256,
      requires: (options.platformRequires ?? []).map(capability => ({ capability, requiredBy: 'platform' })),
      config: [
        ...(portableAdapterConfig ? [{
          id: 'platform.adapters',
          path: '/platform/adapters',
          default: JSON.stringify(portableAdapterConfig),
        }] : []),
        ...(portableAdapterOptions ? [{
          id: 'platform.adapterOptions',
          path: '/platform/adapterOptions',
          default: JSON.stringify(portableAdapterOptions),
        }] : []),
      ],
      profiles: {
        default: {
          platformVersion,
          services: services.map(({ packageName: _packageName, ...service }) => service),
        },
      },
      binaries,
      members: [...new Set([
        ...services.map(service => service.packageName),
        ...memberPackages,
        ...configuredAdapterPackages,
      ])].map(packageName => {
        const item = byName.get(packageName);
        if (!item) { return undefined; }
        return component(
          item,
          services.find(service => service.packageName === packageName)?.id
          ?? adapters.find(adapter => adapter.package === packageName)?.id
          ?? idFor(packageName),
        );
      }),
    }],
    sdks: [component(sdk, 'sdk')],
    plugins,
    adapters,
  };

  return {
    export: indexExport,
    manifestRoot,
    platformVersion,
    sdkVersion: sdk.version,
    graph,
    sdkPeerRange: sdkPlatformRange,
    classifications,
    services,
  };
}
