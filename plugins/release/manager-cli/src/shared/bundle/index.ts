/**
 * Plugin-owned bundle production (cutover plan §6A.2, execution plan PR 3).
 *
 * `stage` → `package` → `seal` → `verify-bundle` → (approval) → `commit`.
 * The release index and binary-manifest logic that used to live in CI-owned
 * `tools/kb-create/scripts/*.mjs` lives here now; those scripts are deleted.
 */

export * from './artifact-manifest.js';
export * from './binary-manifest.js';
export * from './commit.js';
export * from './git.js';
export * from './graph.js';
export * from './intent.js';
export * from './mutations.js';
export * from './package.js';
export * from './release-index.js';
export * from './seal.js';
export * from './stage.js';
export * from './stage-state.js';
export * from './worktree.js';
