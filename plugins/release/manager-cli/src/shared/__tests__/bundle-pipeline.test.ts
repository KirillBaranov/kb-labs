/**
 * End-to-end coverage of the plugin-owned bundle producer:
 * `stage` → `package` → `seal` → `verify-bundle` → `commit`.
 *
 * These run against a real throwaway git repository rather than mocks — the
 * whole point of the design is what git does (a detached worktree, a written
 * tree object, a commit whose tree digest must match provenance), and none of
 * that is observable through a mocked filesystem.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseGraphNodeKey } from '@kb-labs/release-manager-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { commitSealedBundle } from '../bundle/commit.js';
import { loadCandidateIntent } from '../bundle/intent.js';
import { packageStagedBundle } from '../bundle/package.js';
import { kbCreateReleaseIndexSealer, sealBundle } from '../bundle/seal.js';
import { discardStaging, stageRelease } from '../bundle/stage.js';
import { readStageState } from '../bundle/stage-state.js';
import { verifyBundleDirectory } from '../verify-bundle.js';
import {
  FIXTURE_BASE_VERSION,
  FIXTURE_CANDIDATE_ID,
  FIXTURE_RELEASE_ID,
  FIXTURE_RELEASE_VERSION,
  createReleaseFixture,
  type ReleaseFixture,
} from './fixtures/release-workspace.js';

const SEALED_AT = '2026-08-30T00:00:00Z';
const SEAL_OPTIONS = {
  channel: 'canary',
  platformMemberPackages: ['@kb-labs/core-contracts'],
  sealedAt: SEALED_AT,
};

const fixtures: ReleaseFixture[] = [];

function fixture(): ReleaseFixture {
  const created = createReleaseFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) {
    try { discardStaging(created.repoRoot, created.intent.candidateId); } catch { /* already gone */ }
    rmSync(join(created.repoRoot, '..'), { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runPipeline(created: ReleaseFixture, bundleDir: string) {
  const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
  const staged = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256, stagedAt: SEALED_AT });
  const packaged = packageStagedBundle({
    intent,
    intentSha256,
    state: staged.state,
    outDir: bundleDir,
    tarballer: created.tarballer,
    binaries: { dir: created.binariesDir, binaries: created.binaries },
  });
  const sealed = sealBundle({
    ...SEAL_OPTIONS,
    bundleDir,
    indexSealer: created.indexSealer,
  });
  return { intent, intentSha256, staged, packaged, sealed };
}

describe('release bundle producer', () => {
  it('BP-01: stage mutates only the disposable worktree, never the repository checkout', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);

    const { state } = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256 });

    // The primary checkout is untouched: no dirty files, still on master, still
    // at the planned commit, still carrying the pre-release version.
    expect(git(created.repoRoot, ['status', '--porcelain'])).toBe('');
    expect(git(created.repoRoot, ['rev-parse', 'HEAD']).trim()).toBe(created.plannedCommit);
    expect(git(created.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('master');
    const checkedOut = JSON.parse(
      readFileSync(join(created.repoRoot, 'packages/core-runtime/package.json'), 'utf8'),
    ) as { version: string };
    expect(checkedOut.version).toBe(FIXTURE_BASE_VERSION);

    // The staged worktree carries the release versions and the rewritten range.
    const stagedRuntime = JSON.parse(
      readFileSync(join(state.worktree, 'packages/core-runtime/package.json'), 'utf8'),
    ) as { version: string };
    expect(stagedRuntime.version).toBe(FIXTURE_RELEASE_VERSION);
    const stagedPlugin = JSON.parse(
      readFileSync(join(state.worktree, 'plugins/commit/entry/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(stagedPlugin.dependencies['@kb-labs/core-runtime']).toBe(`^${FIXTURE_RELEASE_VERSION}`);
    expect(state.treeSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('BP-02: discarding staging removes the worktree and its git administrative entry', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const { state } = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256 });
    expect(git(created.repoRoot, ['worktree', 'list'])).toContain(state.worktree);

    discardStaging(created.repoRoot, intent.candidateId);

    expect(existsSync(state.worktree)).toBe(false);
    expect(git(created.repoRoot, ['worktree', 'list'])).not.toContain(state.worktree);
    expect(git(created.repoRoot, ['status', '--porcelain'])).toBe('');
  });

  it('BP-03: a mutation set the intent was not signed over is refused, leaving nothing behind', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const tampered = { ...intent, mutationSha256: 'f'.repeat(64) };

    expect(() => stageRelease({ repoRoot: created.repoRoot, intent: tampered, intentSha256 }))
      .toThrow(/does not match the intent's mutationSha256/);

    expect(git(created.repoRoot, ['status', '--porcelain'])).toBe('');
    expect(git(created.repoRoot, ['worktree', 'list']).trim().split('\n')).toHaveLength(1);
  });

  it('BP-04: package + seal produce a bundle that passes every verification rule', () => {
    const created = fixture();
    const bundleDir = join(created.repoRoot, '..', 'bundle');

    const { sealed, packaged } = runPipeline(created, bundleDir);

    expect(sealed.verification.ok).toBe(true);
    expect(sealed.bundle.releaseId).toBe(FIXTURE_RELEASE_ID);
    expect(sealed.provenance.provenance.versions).toEqual({
      platform: FIXTURE_RELEASE_VERSION,
      sdk: FIXTURE_RELEASE_VERSION,
    });
    expect(sealed.provenance.index.version).toBe(FIXTURE_RELEASE_VERSION);
    expect(sealed.provenance.index.channelLabel).toBe('canary');
    expect(packaged.packages).toHaveLength(6);
    expect(sealed.provenance.binaries.map(binary => `${binary.os}/${binary.arch}`))
      .toEqual(['darwin/arm64', 'linux/amd64']);

    // Provenance must never claim a release commit — it does not exist yet.
    expect(Object.keys(sealed.provenance.provenance)).not.toContain('releaseCommit');

    // Classification is exhaustive (rule 6) and matches what the index derived.
    expect(Object.fromEntries(sealed.provenance.packages.map(pkg => [pkg.name, pkg.classification])))
      .toEqual({
        '@kb-labs/adapters-pino': 'adapter',
        '@kb-labs/commit-entry': 'plugin',
        '@kb-labs/core-contracts': 'member',
        '@kb-labs/core-runtime': 'platform',
        '@kb-labs/sdk': 'sdk',
        '@kb-labs/workflow-daemon': 'member',
      });

    // The intermediate packaging record must not survive into the sealed bundle.
    expect(existsSync(join(bundleDir, 'packaging.json'))).toBe(false);
    expect(verifyBundleDirectory(bundleDir, sealed.bundle.bundleSha256).ok).toBe(true);

    // §5.3: no `workspace:` specifier survives into a published dependency.
    //
    // `rewriteWorkspaceDeps` is unit-tested, but that proves the rewrite is
    // correct on the inputs it was handed — not that every dependency in every
    // packed tarball actually went through it. This opens the sealed tarballs
    // and looks, which is the only form of the claim that can catch a package
    // the staging step never visited. The fixture ships a real `workspace:*`
    // dependency (`release-workspace.ts`), so a rewrite that silently stopped
    // running would fail here rather than pass vacuously.
    // The archive root is one directory, but it is not always named `package/`
    // (the test tarballer names it after the source dir, `npm pack` uses
    // `package`), and `--wildcards` is GNU-only. Listing and matching keeps this
    // working on both tars.
    const readPackedManifest = (tarballPath: string): {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    } => {
      const entry = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
        .split('\n')
        .find(line => /^[^/]+\/package\.json$/.test(line.trim()));
      if (!entry) { throw new Error(`no top-level package.json in ${tarballPath}`); }
      return JSON.parse(execFileSync('tar', ['-xOzf', tarballPath, entry.trim()], { encoding: 'utf8' }));
    };

    const packedManifests = sealed.provenance.packages
      .filter(pkg => pkg.tarball !== null)
      .map(pkg => ({ name: pkg.name, manifest: readPackedManifest(join(bundleDir, pkg.tarball!)) }));
    expect(packedManifests.length).toBeGreaterThan(0);

    const unpublishable = packedManifests.flatMap(({ name, manifest }) =>
      Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })
        .filter(([, range]) => range.startsWith('workspace:') || range.startsWith('link:'))
        .map(([dependency, range]) => `${name} → ${dependency}@${range}`));
    expect(unpublishable).toEqual([]);

    // And the rewrite resolved to something concrete rather than dropping the
    // dependency. `workspace:*` means "whatever ships alongside me", which
    // materializes as a caret range on the version this bundle ships.
    const rewritten = packedManifests.find(entry => entry.name === '@kb-labs/commit-entry');
    expect(rewritten?.manifest.dependencies?.['@kb-labs/core-runtime'])
      .toBe(`^${FIXTURE_RELEASE_VERSION}`);
  });

  it('BP-05: two full runs over the same intent produce byte-identical bundle documents', () => {
    const created = fixture();
    const first = join(created.repoRoot, '..', 'bundle-1');
    const second = join(created.repoRoot, '..', 'bundle-2');

    const runOne = runPipeline(created, first);
    const runTwo = runPipeline(created, second);

    expect(runTwo.sealed.bundle.bundleSha256).toBe(runOne.sealed.bundle.bundleSha256);
    expect(runTwo.staged.state.treeSha256).toBe(runOne.staged.state.treeSha256);
    expect(readFileSync(join(second, 'bundle.json'), 'utf8'))
      .toBe(readFileSync(join(first, 'bundle.json'), 'utf8'));
    expect(readFileSync(join(second, 'provenance.json'), 'utf8'))
      .toBe(readFileSync(join(first, 'provenance.json'), 'utf8'));
    expect(readFileSync(join(second, 'release-index.json'), 'utf8'))
      .toBe(readFileSync(join(first, 'release-index.json'), 'utf8'));
  });

  it('BP-06: package refuses a worktree whose tree drifted from the staged digest', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const { state } = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256 });

    writeFileSync(join(state.worktree, 'packages/core-runtime/index.js'), 'export const name = "tampered";\n');

    expect(() => packageStagedBundle({
      intent,
      intentSha256,
      state,
      outDir: join(created.repoRoot, '..', 'bundle'),
      tarballer: created.tarballer,
    })).toThrow(/staged tree digest changed/);
  });

  it('BP-07: package refuses an intent whose package set or versions no longer match the staging', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const { state } = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256 });
    const outDir = join(created.repoRoot, '..', 'bundle');

    const changedSet = {
      ...intent,
      packageSet: intent.packageSet.filter(entry => entry.name !== '@kb-labs/adapters-pino'),
    };
    expect(() => packageStagedBundle({ intent: changedSet, intentSha256, state, outDir, tarballer: created.tarballer }))
      .toThrow(/package set differs/);

    const changedVersion = {
      ...intent,
      packageSet: intent.packageSet.map(entry =>
        entry.name === '@kb-labs/sdk' ? { ...entry, version: '9.9.9' } : entry),
    };
    const stateForChangedVersion = { ...state, packageSet: changedVersion.packageSet };
    expect(() => packageStagedBundle({
      intent: changedVersion, intentSha256, state: stateForChangedVersion, outDir, tarballer: created.tarballer,
    })).toThrow(/version mismatch for @kb-labs\/sdk/);
  });

  it('BP-08: package refuses a bundle staged for a different intent', () => {
    const created = fixture();
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const { state } = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256 });

    expect(() => packageStagedBundle({
      intent,
      intentSha256: 'c'.repeat(64),
      state,
      outDir: join(created.repoRoot, '..', 'bundle'),
      tarballer: created.tarballer,
    })).toThrow(/staged worktree was created for a different intent/);
  });

  it('BP-09: commit binds a real commit whose tree digest equals provenance.treeSha256', () => {
    const created = fixture();
    const bundleDir = join(created.repoRoot, '..', 'bundle');
    const { sealed } = runPipeline(created, bundleDir);

    const result = commitSealedBundle({
      repoRoot: created.repoRoot,
      bundleDir,
      tag: `platform-v${FIXTURE_RELEASE_VERSION}`,
    });

    expect(result.treeSha256).toBe(sealed.provenance.provenance.treeSha256);
    expect(result.releaseCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(result.tag).toBe(`platform-v${FIXTURE_RELEASE_VERSION}`);

    // The release commit exists as an object and is anchored by the tag, but
    // master itself never moved.
    expect(git(created.repoRoot, ['rev-parse', 'master']).trim()).toBe(created.plannedCommit);
    expect(git(created.repoRoot, ['rev-parse', `${result.tag}^{commit}`]).trim()).toBe(result.releaseCommit);
    expect(git(created.repoRoot, ['status', '--porcelain'])).toBe('');
  });

  it('BP-10: commit refuses when the staged tree no longer matches the sealed provenance', () => {
    const created = fixture();
    const bundleDir = join(created.repoRoot, '..', 'bundle');
    runPipeline(created, bundleDir);

    const state = readStageState(created.repoRoot, FIXTURE_CANDIDATE_ID);
    writeFileSync(join(state.worktree, 'packages/core-runtime/index.js'), 'export const name = "tampered";\n');

    expect(() => commitSealedBundle({ repoRoot: created.repoRoot, bundleDir }))
      .toThrow(/does not match the approved bytes/);
  });

  it('BP-11: seal refuses to return a bundle that would fail verification', () => {
    const created = fixture();
    const bundleDir = join(created.repoRoot, '..', 'bundle');
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const staged = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256, stagedAt: SEALED_AT });
    packageStagedBundle({
      intent, intentSha256, state: staged.state, outDir: bundleDir, tarballer: created.tarballer,
      binaries: { dir: created.binariesDir, binaries: created.binaries },
    });

    // Bytes that changed after packaging: the packaged hash and the bytes on
    // disk no longer agree, which is exactly what sealing must not paper over.
    writeFileSync(join(bundleDir, 'bin/linux-amd64/kb-create'), 'swapped-binary\n');

    expect(() => sealBundle({ ...SEAL_OPTIONS, bundleDir, indexSealer: created.indexSealer }))
      .toThrow(/sealed bundle fails verification/);
  });

  /**
   * The cross-language regression signal.
   *
   * Every other case here uses the deterministic stand-in sealer, which accepts
   * whatever shape the plugin hands it. This one runs the *real* Go sealer and
   * then reads its output back through the launcher's only reader, so a plugin
   * export that the Go catalog cannot decode fails here rather than in a
   * release.
   */
  it('BP-12: the export the plugin builds seals and reads back through the real Go catalog', () => {
    if (spawnSync('go', ['version']).status !== 0) {
      // A Go toolchain is not a prerequisite for the plugin's own test suite;
      // CI runs kb-create's Go tests alongside it and always has one.
      return;
    }

    const kbCreateDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../tools/kb-create');
    expect(existsSync(join(kbCreateDir, 'go.mod'))).toBe(true);

    const created = fixture();
    const bundleDir = join(created.repoRoot, '..', 'bundle');
    const { intent, intentSha256 } = loadCandidateIntent(created.intentPath);
    const staged = stageRelease({ repoRoot: created.repoRoot, intent, intentSha256, stagedAt: SEALED_AT });
    packageStagedBundle({
      intent, intentSha256, state: staged.state, outDir: bundleDir, tarballer: created.tarballer,
      binaries: { dir: created.binariesDir, binaries: created.binaries },
    });

    const sealed = sealBundle({
      ...SEAL_OPTIONS,
      bundleDir,
      indexSealer: kbCreateReleaseIndexSealer({ kbCreateDir }),
    });

    const index = JSON.parse(readFileSync(join(bundleDir, 'release-index.json'), 'utf8')) as {
      schema: string;
      digest: string;
      releaseId: string;
      channels?: unknown;
      compatibility: { schema: string; nodes: Array<{ id: string; kind: 'package' | 'binary'; version: string; os?: string; arch?: string }> };
    };

    expect(index.schema).toBe('kb.create.release-index/v2');
    expect(index.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(index.releaseId).toBe(FIXTURE_RELEASE_ID);
    // A channel is an externally resolved pointer; the sealed index carries none.
    expect(index.channels).toBeUndefined();
    expect(index.compatibility.schema).toBe('kb.release-compatibility/3');

    // The index and the bundle's provenance describe one graph, not two.
    expect(index.compatibility.nodes.map(releaseGraphNodeKey))
      .toEqual(sealed.provenance.graph.nodes.map(releaseGraphNodeKey));

    // Read back exactly as the launcher does: schema probe, digest verification,
    // catalog validation and compatibility-graph validation.
    const verified = spawnSync('go', [
      'run', './v2/cmd/kb-create-release-index', '--verify', join(bundleDir, 'release-index.json'),
    ], { cwd: kbCreateDir, encoding: 'utf8' });
    expect(`${verified.status} ${verified.stderr}`.trim()).toBe('0');
  }, 300_000);
});
