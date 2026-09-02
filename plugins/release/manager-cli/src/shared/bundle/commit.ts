/**
 * `release commit` — bind a real commit to an already-sealed bundle.
 *
 * Conceptually this runs only after approval (execution plan §3.4): the
 * operator signs `{intentDigest, bundleSha256, requestedTarget}` over artifacts
 * that already exist, and only then does anything become a commit. The approval
 * gate itself is owned by Workflow and is not wired here — this module
 * implements the mechanics the gate will call.
 *
 * The one check that makes the whole scheme work is the last one: the tree of
 * the commit this creates must digest to exactly `provenance.treeSha256`. That
 * proves the commit matches the bytes that were actually built and verified,
 * rather than the bytes someone promised to build.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ReleaseBundleProvenanceSchema,
  ReleaseBundleSchema,
  type ReleaseBundle,
  type ReleaseBundleProvenance,
} from '@kb-labs/release-manager-contracts';

import { git, gitOrThrow, treeSha256 } from './git.js';
import { readStageState, type StageState } from './stage-state.js';

export interface CommitBundleOptions {
  repoRoot: string;
  bundleDir: string;
  message?: string;
  /** Annotated tag to anchor the release commit; omitted means commit only. */
  tag?: string;
}

export interface CommitBundleResult {
  releaseId: string;
  candidateId: string;
  bundleSha256: string;
  releaseCommit: string;
  treeSha256: string;
  tag: string | null;
  worktree: string;
}

function readSealed(bundleDir: string): { bundle: ReleaseBundle; provenance: ReleaseBundleProvenance } {
  const manifestPath = resolve(bundleDir, 'bundle.json');
  const provenancePath = resolve(bundleDir, 'provenance.json');
  for (const path of [manifestPath, provenancePath]) {
    if (!existsSync(path)) {
      throw new Error(`bundle is not sealed: ${path} is missing — run \`kb release seal --bundle ${bundleDir}\` first`);
    }
  }
  return {
    bundle: ReleaseBundleSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown),
    provenance: ReleaseBundleProvenanceSchema.parse(JSON.parse(readFileSync(provenancePath, 'utf8')) as unknown),
  };
}

function assertStateMatchesBundle(state: StageState, bundle: ReleaseBundle, provenance: ReleaseBundleProvenance): void {
  if (state.intentSha256 !== bundle.intentSha256) {
    throw new Error('the staged worktree belongs to a different intent than this bundle');
  }
  if (state.treeSha256 !== provenance.provenance.treeSha256) {
    throw new Error('the staged worktree no longer records the tree this bundle was sealed from');
  }
  if (!existsSync(state.worktree)) {
    throw new Error(`staged worktree is gone: ${state.worktree} — the bundle cannot be committed from a tree that no longer exists`);
  }
}

export function commitSealedBundle(options: CommitBundleOptions): CommitBundleResult {
  const bundleDir = resolve(options.bundleDir);
  const { bundle, provenance } = readSealed(bundleDir);
  const state = readStageState(options.repoRoot, bundle.candidateId);
  assertStateMatchesBundle(state, bundle, provenance);

  const message = options.message
    ?? `chore(release): ${bundle.releaseId}\n\nbundleSha256: ${bundle.bundleSha256}\nintentSha256: ${bundle.intentSha256}\n`;

  gitOrThrow(state.worktree, ['add', '--all']);
  // `--allow-empty` is deliberately not passed: an empty release commit would
  // mean staging applied no mutations at all, which is a planning failure.
  const commitResult = git(state.worktree, ['commit', '--no-verify', '--message', message]);
  if (commitResult.status !== 0) {
    throw new Error(`release commit failed: ${(commitResult.stderr || commitResult.stdout).trim()}`);
  }

  const releaseCommit = gitOrThrow(state.worktree, ['rev-parse', 'HEAD']).trim();
  const actualTree = treeSha256(state.worktree, `${releaseCommit}^{tree}`);

  if (actualTree !== provenance.provenance.treeSha256) {
    // Leave the commit object in place but refuse to anchor it: an unreferenced
    // commit is garbage-collectable, a tag pointing at the wrong tree is not.
    throw new Error(
      `release commit ${releaseCommit} has tree digest ${actualTree}, but the sealed bundle was built from `
      + `${provenance.provenance.treeSha256} — the commit does not match the approved bytes`,
    );
  }

  let tag: string | null = null;
  if (options.tag) {
    const tagResult = git(state.worktree, ['tag', '--annotate', options.tag, '--message', message, releaseCommit]);
    if (tagResult.status !== 0) {
      throw new Error(`could not create release tag ${options.tag}: ${(tagResult.stderr || tagResult.stdout).trim()}`);
    }
    tag = options.tag;
  }

  return {
    releaseId: bundle.releaseId,
    candidateId: bundle.candidateId,
    bundleSha256: bundle.bundleSha256,
    releaseCommit,
    treeSha256: actualTree,
    tag,
    worktree: state.worktree,
  };
}
