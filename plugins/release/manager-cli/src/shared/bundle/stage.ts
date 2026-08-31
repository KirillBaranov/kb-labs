/**
 * `release stage` — apply the planned mutations in a disposable worktree.
 *
 * Execution plan §3.4, consequence 1: every mutation made before approval lives
 * in a one-shot git worktree, so `master` and the primary working tree are
 * untouched no matter how the release ends. A rejected or abandoned release
 * costs a temp directory, not a dirty checkout.
 *
 * The command's product is `treeSha256` — the digest of the tree the artifacts
 * will actually be built from. Everything after this point (`package`, `seal`,
 * `commit`) is checked against it.
 */

import { existsSync } from 'node:fs';

import { writeTreeSha256 } from './git.js';
import type { CandidateReleaseIntent } from './intent.js';
import {
  applyMutationPlan,
  assertMutationPlanMatchesIntent,
  buildMutationPlan,
  type MutationPlan,
} from './mutations.js';
import {
  clearStageState,
  readStageState,
  stageStatePath,
  writeStageState,
  type StageState,
} from './stage-state.js';
import { createStagingWorktree, disposeStagingWorktreeAt } from './worktree.js';

export interface StageReleaseOptions {
  repoRoot: string;
  intent: CandidateReleaseIntent;
  intentSha256: string;
  /** Changelog bytes the plan froze, keyed by worktree-relative path. */
  changelogs?: Record<string, string>;
  /** Fixed staging timestamp; supplied by tests so state files stay comparable. */
  stagedAt?: string;
}

export interface StageReleaseResult {
  state: StageState;
  statePath: string;
  plan: MutationPlan;
}

/**
 * Removes a previous staging attempt for the same candidate.
 *
 * Re-staging is normal (a failed check, a retried run); leaving the old
 * worktree behind would leak both a directory and a `.git/worktrees` entry.
 */
function discardPreviousStaging(repoRoot: string, candidateId: string): void {
  if (!existsSync(stageStatePath(repoRoot, candidateId))) { return; }
  try {
    const previous = readStageState(repoRoot, candidateId);
    disposeStagingWorktreeAt(repoRoot, previous.worktree);
  } catch {
    // An unreadable state file is itself the thing being replaced.
  }
  clearStageState(repoRoot, candidateId);
}

export function stageRelease(options: StageReleaseOptions): StageReleaseResult {
  const { repoRoot, intent, intentSha256 } = options;

  discardPreviousStaging(repoRoot, intent.candidateId);

  const worktree = createStagingWorktree(repoRoot, intent.source.plannedCommit, intent.candidateId);
  try {
    const plan = buildMutationPlan(worktree.path, intent, { changelogs: options.changelogs });
    assertMutationPlanMatchesIntent(plan, intent);
    applyMutationPlan(worktree.path, plan, options.changelogs ?? {});

    const { gitTree, treeSha256 } = writeTreeSha256(worktree.path);

    const state: StageState = {
      schema: 'kb.release-stage-state/1',
      releaseId: intent.releaseId,
      candidateId: intent.candidateId,
      intentSha256,
      plannedCommit: intent.source.plannedCommit,
      mutationSha256: intent.mutationSha256,
      treeSha256,
      gitTree,
      worktree: worktree.path,
      packageSet: intent.packageSet.map(entry => ({ name: entry.name, version: entry.version })),
      stagedAt: options.stagedAt ?? new Date().toISOString(),
    };

    return { state, statePath: writeStageState(repoRoot, state), plan };
  } catch (error) {
    // Any failure destroys the worktree: a half-applied staging tree must never
    // be reachable, and there is nothing in it worth keeping.
    worktree.dispose();
    throw error;
  }
}

/** Disposes of a candidate's staging worktree and forgets its state. */
export function discardStaging(repoRoot: string, candidateId: string): void {
  discardPreviousStaging(repoRoot, candidateId);
}
