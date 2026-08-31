/**
 * `release seal` — turn a packaged directory into a sealed bundle.
 *
 * Reads the exact local artifacts `release package` produced, builds the
 * release index and the compatibility graph over them, and writes the three
 * documents everything downstream trusts: `release-index.json`,
 * `provenance.json` and the canonical `bundle.json` carrying `bundleSha256`.
 *
 * Sealing then runs the full bundle verifier itself. Cutover plan §6A.2 makes
 * `verify-bundle` mandatory immediately after seal; running it here means a
 * caller cannot obtain a "sealed" result for a bundle that would fail, so the
 * Workflow layer can enforce the rule by simply believing the exit status.
 *
 * `provenance` deliberately carries no `releaseCommit`: at sealing time the
 * release commit does not exist yet (execution plan §3.4, consequence 2). The
 * binding runs the other way — `release commit` checks the commit it creates
 * against `provenance.treeSha256`.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import {
  ReleaseBundleProvenanceSchema,
  canonicalSha256,
  type ReleaseBundle,
  type ReleaseBundleProvenance,
} from '@kb-labs/release-manager-contracts';

import { buildCompatibilityGraph } from './graph.js';
import { readPackagingRecord, PACKAGING_FILE, type PackagingRecord } from './package.js';
import { buildReleaseIndex, type ReleaseIndexExport, type StagedArtifactRef } from './release-index.js';
import { verifyBundleDirectory, type BundleVerificationReport } from '../verify-bundle.js';

export const RELEASE_INDEX_FILE = 'release-index.json';

/**
 * Seals the normalized export into the immutable `kb.create.release-index/v2`
 * document.
 *
 * That format — its schema stamp, catalog validation and digest — is owned by
 * `kb-create`, and the launcher validates against *that* implementation, so the
 * plugin calls it rather than growing a second, silently-diverging copy. Only
 * the export it is given is plugin-owned domain logic.
 */
export type ReleaseIndexSealer = (input: {
  exportValue: ReleaseIndexExport;
  manifestRoot: string;
  outputPath: string;
}) => void;

export interface KbCreateSealerOptions {
  /** Prebuilt `kb-create-release-index` binary; falls back to `go run` in the kb-create module. */
  sealerBin?: string;
  kbCreateDir?: string;
}

export function kbCreateReleaseIndexSealer(options: KbCreateSealerOptions = {}): ReleaseIndexSealer {
  return ({ exportValue, manifestRoot, outputPath }) => {
    const exportPath = `${outputPath}.export.json`;
    writeFileSync(exportPath, `${JSON.stringify(exportValue, null, 2)}\n`);
    try {
      const result = options.sealerBin
        ? spawnSync(options.sealerBin, ['--input', exportPath, '--manifest-root', manifestRoot, '--output', outputPath], { encoding: 'utf8' })
        : spawnSync('go', ['run', './v2/cmd/kb-create-release-index', '--input', exportPath, '--manifest-root', manifestRoot, '--output', outputPath], {
          cwd: options.kbCreateDir ?? resolve(process.cwd(), 'tools/kb-create'),
          encoding: 'utf8',
        });
      if (result.status !== 0) {
        throw new Error(`release-index sealer failed: ${(result.stderr || result.stdout || '').trim()}`);
      }
    } finally {
      rmSync(exportPath, { force: true });
    }
  };
}

export interface SealBundleOptions {
  bundleDir: string;
  /** Channel label recorded in the index; the channel *model* lands in a later PR. */
  channel: string;
  registry?: string;
  platformPackage?: string;
  sdkPackage?: string;
  platformRequires?: string[];
  platformAdapterConfig?: Record<string, string>;
  platformAdapterOptions?: Record<string, unknown>;
  platformMemberPackages?: string[];
  /** Overrides the sealer; the default calls kb-create's `kb-create-release-index`. */
  indexSealer?: ReleaseIndexSealer;
  /** Fixed sealing timestamp — supplied by tests so the bundle stays byte-stable. */
  sealedAt?: string;
  /** Scratch directory for tarball extraction; defaults to a sibling of the bundle. */
  workDir?: string;
}

export interface SealBundleResult {
  bundle: ReleaseBundle;
  provenance: ReleaseBundleProvenance;
  verification: BundleVerificationReport;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(root: string, current = root, out: string[] = []): string[] {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = resolve(current, entry.name);
    if (entry.isDirectory()) { listFiles(root, full, out); } else if (entry.isFile()) {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

function stagedRefs(bundleDir: string, record: PackagingRecord): StagedArtifactRef[] {
  return record.packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,
    tarball: resolve(bundleDir, pkg.tarball),
    sha256: pkg.sha256,
  }));
}

export function sealBundle(options: SealBundleOptions): SealBundleResult {
  const bundleDir = resolve(options.bundleDir);
  const record = readPackagingRecord(bundleDir);
  const platformPackage = options.platformPackage ?? '@kb-labs/core-runtime';
  const sdkPackage = options.sdkPackage ?? '@kb-labs/sdk';

  const workDir = options.workDir ?? resolve(bundleDir, '..', `${record.candidateId.replace(/[^A-Za-z0-9._-]+/g, '-')}-seal-work`);
  mkdirSync(workDir, { recursive: true });

  let index: ReturnType<typeof buildReleaseIndex>;
  try {
    index = buildReleaseIndex(stagedRefs(bundleDir, record), {
      channel: options.channel,
      registry: options.registry,
      platformPackage,
      sdkPackage,
      binaries: record.binaries.map(binary => ({
        id: binary.id,
        os: binary.os,
        arch: binary.arch,
        filename: binary.filename,
        sha256: binary.sha256,
        url: binary.url,
      })),
      platformRequires: options.platformRequires,
      platformAdapterConfig: options.platformAdapterConfig,
      platformAdapterOptions: options.platformAdapterOptions,
      platformMemberPackages: options.platformMemberPackages,
      workDir,
    });

    const indexPath = resolve(bundleDir, RELEASE_INDEX_FILE);
    const sealer = options.indexSealer ?? kbCreateReleaseIndexSealer();
    sealer({ exportValue: index.export, manifestRoot: index.manifestRoot, outputPath: indexPath });
    if (!existsSync(indexPath)) {
      throw new Error(`release-index sealer produced no ${RELEASE_INDEX_FILE}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const indexPath = resolve(bundleDir, RELEASE_INDEX_FILE);
  const indexSha256 = sha256File(indexPath);

  const sdkPeerRange = (index.export.compatibility.labels[0] as {
    requires?: Array<{ constraint?: string }>;
  }).requires?.[0]?.constraint;
  if (!sdkPeerRange) {
    throw new Error('release index carries no platform→sdk compatibility constraint');
  }

  const tarballByName = new Map(record.packages.map(pkg => [pkg.name, pkg] as const));

  const provenanceDraft: ReleaseBundleProvenance = {
    schema: 'kb.release-bundle-provenance/1',
    releaseId: record.releaseId,
    candidateId: record.candidateId,
    provenance: {
      plannedCommit: record.plannedCommit,
      treeSha256: record.treeSha256,
      intentSha256: record.intentSha256,
      sealedAt: options.sealedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      versions: { platform: index.platformVersion, sdk: index.sdkVersion },
    },
    plannedPackages: record.packages
      .map(pkg => ({ name: pkg.name, version: pkg.version }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    packages: index.classifications
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(pkg => {
        const artifact = tarballByName.get(pkg.name);
        // A `deliveryOnly` package ships no tarball by definition (rule 1);
        // everything else must carry the exact bytes it was packaged from.
        return pkg.classification === 'deliveryOnly'
          ? { ...pkg, tarball: null, sha256: null }
          : { ...pkg, tarball: artifact!.tarball, sha256: artifact!.sha256 };
      }),
    binaries: record.binaries
      .filter(binary => binary.path !== null)
      .map(binary => ({
        id: binary.id,
        version: index.platformVersion,
        os: binary.os,
        arch: binary.arch,
        path: binary.path!,
        sha256: binary.sha256,
      })),
    index: {
      path: RELEASE_INDEX_FILE,
      sha256: indexSha256,
      version: index.platformVersion,
      channelLabel: options.channel,
    },
    graph: buildCompatibilityGraph({
      packages: index.classifications,
      binaries: record.binaries.map(binary => ({
        id: binary.id, os: binary.os, arch: binary.arch, version: index.platformVersion,
      })),
      platformPackage,
      platformVersion: index.platformVersion,
      sdkPackage,
      sdkVersion: index.sdkVersion,
      sdkPeerRange,
      memberPackages: options.platformMemberPackages ?? [],
    }),
  };

  const provenance = ReleaseBundleProvenanceSchema.parse(provenanceDraft);
  writeFileSync(resolve(bundleDir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);

  // The packaging handoff is an intermediate, not a deliverable: leaving it in
  // place would make it an unlisted file under rule 5, and listing it would put
  // a non-reproducible scratch record inside the sealed inventory.
  rmSync(resolve(bundleDir, PACKAGING_FILE), { force: true });

  const files = listFiles(bundleDir)
    .filter(path => path !== 'bundle.json')
    .map(path => {
      const full = resolve(bundleDir, path);
      return { path, sha256: sha256File(full), size: statSync(full).size };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const draft: Omit<ReleaseBundle, 'bundleSha256'> = {
    schema: 'kb.release-bundle/1',
    releaseId: record.releaseId,
    candidateId: record.candidateId,
    intentSha256: record.intentSha256,
    indexSha256,
    treeSha256: record.treeSha256,
    files,
  };
  const bundleSha256 = canonicalSha256({ ...draft, bundleSha256: '' });
  const bundle: ReleaseBundle = { ...draft, bundleSha256 };
  writeFileSync(resolve(bundleDir, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);

  const verification = verifyBundleDirectory(bundleDir, bundleSha256);
  if (!verification.ok) {
    const summary = verification.diagnostics
      .map(diagnostic => `[rule ${diagnostic.rule}] ${diagnostic.code}: ${diagnostic.message}`)
      .join('\n');
    throw new Error(`sealed bundle fails verification and must not be handed on:\n${summary}`);
  }

  return { bundle, provenance, verification };
}
