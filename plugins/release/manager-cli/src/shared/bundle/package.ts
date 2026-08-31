/**
 * `release package` — produce the release's exact bytes from the staged tree.
 *
 * Per cutover plan §6A.2 this operates *only* inside the staged worktree and
 * *only* on the intent's exact package set, and it must reject three things
 * outright: a tree digest different from the staged `treeSha256`, a changed
 * package list, and a version mismatch. Those three rejections are the whole
 * point of the command — without them "package" would quietly become a second,
 * unreviewed decision about what a release contains.
 *
 * The output is not yet a bundle: it is the packaged inventory plus a
 * `packaging.json` handoff record that `release seal` turns into
 * `release-index.json`, `provenance.json` and `bundle.json`.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';

import { z } from 'zod';

import { writeTreeSha256 } from './git.js';
import type { CandidateReleaseIntent } from './intent.js';
import { discoverWorkspacePackages } from './mutations.js';
import type { StageState } from './stage-state.js';
import { assertBinaryManifest, type NormalizedBinary } from './binary-manifest.js';

export const PACKAGING_FILE = 'packaging.json';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const PackagingRecordSchema = z.object({
  schema: z.literal('kb.release-packaging/1'),
  releaseId: z.string().min(1),
  candidateId: z.string().min(1),
  intentSha256: sha256Schema,
  plannedCommit: z.string().regex(/^[a-f0-9]{40}$/),
  treeSha256: sha256Schema,
  packages: z.array(z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    /** Bundle-relative tarball path. */
    tarball: z.string().min(1),
    sha256: sha256Schema,
  }).strict()).min(1),
  binaries: z.array(z.object({
    id: z.string().min(1),
    os: z.enum(['linux', 'darwin']),
    arch: z.enum(['amd64', 'arm64']),
    filename: z.string().min(1),
    url: z.string().min(1),
    sha256: sha256Schema,
    /** Bundle-relative path, when the bytes ship inside the bundle. */
    path: z.string().min(1).nullable(),
  }).strict()),
}).strict();

export type PackagingRecord = z.infer<typeof PackagingRecordSchema>;

/**
 * Packs one workspace package into `destination`, returning the tarball name.
 *
 * Injectable so the deterministic bundle tests do not need a package manager in
 * the loop — the real implementation shells out to `pnpm pack`.
 */
export type PackageTarballer = (input: {
  packageDir: string;
  name: string;
  version: string;
  destination: string;
}) => string;

/** pnpm prints the produced tarball's absolute path as its last stdout line. */
export const pnpmPackTarballer: PackageTarballer = ({ packageDir, destination }) => {
  const result = spawnSync('pnpm', ['pack', '--pack-destination', destination], { cwd: packageDir, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`pnpm pack failed for ${packageDir}${detail ? `: ${detail}` : ''}`);
  }
  const lines = (result.stdout ?? '').trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) { throw new Error(`pnpm pack produced no tarball for ${packageDir}`); }
  return basename(last.trim());
};

export interface BinarySource {
  /** Directory holding the built binaries named `<id>-<os>-<arch>`. */
  dir: string;
  /** Already-normalized binary manifest entries (see `binary-manifest.ts`). */
  binaries: NormalizedBinary[];
}

export interface PackageBundleOptions {
  intent: CandidateReleaseIntent;
  intentSha256: string;
  state: StageState;
  outDir: string;
  tarballer?: PackageTarballer;
  binaries?: BinarySource;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Re-derives the staged tree digest and rejects any drift.
 *
 * Staging and packaging are separate invocations, possibly minutes apart; if
 * anything touched the worktree in between, the artifacts would no longer come
 * from the tree the provenance is about to claim.
 */
function assertStagedTreeUnchanged(state: StageState): void {
  if (!existsSync(state.worktree)) {
    throw new Error(`staged worktree is gone: ${state.worktree} — re-run \`kb release stage\``);
  }
  const { treeSha256 } = writeTreeSha256(state.worktree);
  if (treeSha256 !== state.treeSha256) {
    throw new Error(
      `staged tree digest changed: expected ${state.treeSha256}, worktree is now ${treeSha256}`,
    );
  }
}

function assertPackageSetUnchanged(intent: CandidateReleaseIntent, state: StageState): void {
  const planned = intent.packageSet.map(entry => `${entry.name}@${entry.version}`).sort().join(',');
  const staged = state.packageSet.map(entry => `${entry.name}@${entry.version}`).sort().join(',');
  if (planned !== staged) {
    throw new Error('intent package set differs from the staged package set');
  }
}

export function packageStagedBundle(options: PackageBundleOptions): PackagingRecord {
  const { intent, intentSha256, state, outDir } = options;
  const tarballer = options.tarballer ?? pnpmPackTarballer;

  if (state.intentSha256 !== intentSha256) {
    throw new Error(
      `staged worktree was created for a different intent (${state.intentSha256}); this intent is ${intentSha256}`,
    );
  }
  assertPackageSetUnchanged(intent, state);
  assertStagedTreeUnchanged(state);

  const workspace = new Map(discoverWorkspacePackages(state.worktree).map(pkg => [pkg.name, pkg] as const));
  const npmDir = join(outDir, 'npm');
  mkdirSync(npmDir, { recursive: true });

  const packages: PackagingRecord['packages'] = [];
  for (const entry of [...intent.packageSet].sort((left, right) => left.name.localeCompare(right.name))) {
    const pkg = workspace.get(entry.name);
    if (!pkg) {
      throw new Error(`intent plans ${entry.name}, which is absent from the staged worktree`);
    }
    if (pkg.version !== entry.version) {
      throw new Error(
        `version mismatch for ${entry.name}: intent plans ${entry.version}, staged tree has ${pkg.version}`,
      );
    }

    const packageDir = join(state.worktree, ...(pkg.dir === '.' ? [] : pkg.dir.split('/')));
    const filename = tarballer({ packageDir, name: entry.name, version: entry.version, destination: npmDir });
    const tarballPath = join(npmDir, filename);
    if (!existsSync(tarballPath)) {
      throw new Error(`packer reported ${filename} for ${entry.name} but produced no such file`);
    }
    packages.push({
      name: entry.name,
      version: entry.version,
      tarball: `npm/${filename}`,
      sha256: sha256File(tarballPath),
    });
  }

  const binaries: PackagingRecord['binaries'] = [];
  if (options.binaries) {
    const platformVersion = intent.packageSet.find(entry => entry.name === '@kb-labs/core-runtime')?.version;
    const normalized = assertBinaryManifest(options.binaries.binaries, platformVersion ?? '');
    const binDir = join(outDir, 'bin');
    for (const binary of [...normalized].sort((left, right) =>
      `${left.id}:${left.os}/${left.arch}`.localeCompare(`${right.id}:${right.os}/${right.arch}`))) {
      const source = join(options.binaries.dir, binary.filename);
      if (!existsSync(source)) {
        throw new Error(`binary ${binary.filename} is declared in the manifest but missing from ${options.binaries.dir}`);
      }
      const relative = `bin/${binary.os}-${binary.arch}/${binary.id}`;
      const target = join(binDir, `${binary.os}-${binary.arch}`, binary.id);
      mkdirSync(join(binDir, `${binary.os}-${binary.arch}`), { recursive: true });
      copyFileSync(source, target);
      const actual = sha256File(target);
      if (actual !== binary.sha256) {
        throw new Error(`binary ${binary.filename} hashes to ${actual}, manifest claims ${binary.sha256}`);
      }
      binaries.push({
        id: binary.id,
        os: binary.os,
        arch: binary.arch,
        filename: binary.filename,
        url: binary.url,
        sha256: binary.sha256,
        path: relative,
      });
    }
  }

  const record = PackagingRecordSchema.parse({
    schema: 'kb.release-packaging/1',
    releaseId: intent.releaseId,
    candidateId: intent.candidateId,
    intentSha256,
    plannedCommit: intent.source.plannedCommit,
    treeSha256: state.treeSha256,
    packages,
    binaries,
  } satisfies PackagingRecord);

  writeFileSync(join(outDir, PACKAGING_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function readPackagingRecord(bundleDir: string): PackagingRecord {
  const path = join(bundleDir, PACKAGING_FILE);
  if (!existsSync(path)) {
    throw new Error(`no ${PACKAGING_FILE} in ${bundleDir} — run \`kb release package --intent <intent.json> --out ${bundleDir}\` first`);
  }
  const parsed = PackagingRecordSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (!parsed.success) {
    throw new Error(`${PACKAGING_FILE} is not readable: ${parsed.error.message}`);
  }
  return parsed.data;
}
