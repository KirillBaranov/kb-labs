/**
 * The handoff record between `stage`, `package` and `commit`.
 *
 * These are three separate command invocations over one disposable worktree,
 * so something has to carry "which worktree, built from which tree, for which
 * intent" between them. It is deliberately *not* a release decision: every
 * field in it is re-derived and re-checked by the command that reads it, so a
 * tampered state file causes a rejection rather than a different release.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const StageStateSchema = z.object({
  schema: z.literal('kb.release-stage-state/1'),
  releaseId: z.string().min(1),
  candidateId: z.string().min(1),
  intentSha256: sha256,
  plannedCommit: z.string().regex(/^[a-f0-9]{40}$/),
  mutationSha256: sha256,
  treeSha256: sha256,
  /** git tree object name of the staged content (SHA-1; the contract digest is `treeSha256`). */
  gitTree: z.string().min(1),
  worktree: z.string().min(1),
  packageSet: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) }).strict()).min(1),
  stagedAt: z.string().min(1),
}).strict();

export type StageState = z.infer<typeof StageStateSchema>;

/** Filesystem-safe form of a candidate id, which may contain `/` or `@`. */
function slug(candidateId: string): string {
  return candidateId.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * State lives under the git directory, not in the working tree.
 *
 * Staging's contract is that the primary working tree is left exactly as it was
 * found (execution plan §3.4), and a state file inside it would show up as an
 * untracked change — a small violation of the same rule the whole disposable-
 * worktree design exists to uphold. `--git-common-dir` also keeps one shared
 * location when the repository itself is checked out as several worktrees.
 */
export function stageStatePath(repoRoot: string, candidateId: string): string {
  return join(gitCommonDir(repoRoot), 'kb-release', 'staged', `${slug(candidateId)}.json`);
}

function gitCommonDir(repoRoot: string): string {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`not a git repository: ${repoRoot}`);
  }
  return result.stdout.trim();
}

export function writeStageState(repoRoot: string, state: StageState): string {
  const path = stageStatePath(repoRoot, state.candidateId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(StageStateSchema.parse(state), null, 2)}\n`);
  return path;
}

export function readStageState(repoRoot: string, candidateId: string): StageState {
  const path = stageStatePath(repoRoot, candidateId);
  if (!existsSync(path)) {
    throw new Error(`no staged worktree recorded for ${candidateId} — run \`kb release stage --intent <intent.json>\` first`);
  }
  const parsed = StageStateSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (!parsed.success) {
    throw new Error(`stage state for ${candidateId} is not readable: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function clearStageState(repoRoot: string, candidateId: string): void {
  rmSync(stageStatePath(repoRoot, candidateId), { force: true });
}
