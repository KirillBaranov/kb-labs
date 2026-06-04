import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findMonorepoRoot } from '../bootstrap';

/**
 * Regression: a git worktree nested under the main checkout has its OWN
 * pnpm-workspace.yaml. The daemon runs inside the worktree, so discovery must
 * root at the worktree — not walk up to the parent checkout. The previous
 * implementation preferred the *topmost* workspace (and gated on a stale
 * `kb-*` literal that no longer appears in the globs), so a nested worktree
 * always resolved back to the parent — silently loading the parent branch's
 * plugins. This test fails against that behaviour and passes after the fix
 * (return the NEAREST ancestor that owns a pnpm-workspace.yaml).
 */
describe('findMonorepoRoot', () => {
  const created: string[] = [];
  afterEach(() => {
    for (const d of created.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  const ws = (dir: string) =>
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - core/*\n  - plugins/*/*\n', 'utf8');

  it('returns the nearest workspace — the worktree, not the parent checkout', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'kb-main-'));
    created.push(parent);
    ws(parent); // parent checkout owns a workspace file

    const worktree = join(parent, '.claude', 'worktrees', 'feat-x');
    mkdirSync(worktree, { recursive: true });
    ws(worktree); // nested worktree ALSO owns one

    const start = join(worktree, 'services', 'rest-api', 'app');
    mkdirSync(start, { recursive: true });

    expect(await findMonorepoRoot(start)).toBe(worktree);
  });

  it('returns the single workspace root for a normal (non-worktree) checkout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kb-solo-'));
    created.push(root);
    ws(root);
    const start = join(root, 'plugins', 'mind', 'entry');
    mkdirSync(start, { recursive: true });

    expect(await findMonorepoRoot(start)).toBe(root);
  });
});
