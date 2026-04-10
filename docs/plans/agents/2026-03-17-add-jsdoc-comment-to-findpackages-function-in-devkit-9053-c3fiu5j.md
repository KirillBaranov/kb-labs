# Plan: Add JSDoc Comment to `findPackages` in Devkit
## Table of Contents
- [Task](#task)
- [Current State](#current-state)
  - [Primary function — `infra/kb-labs-devkit/bin/lib/find-packages.mjs` (lines 13–23)](#primary-function-—-infrakb-labs-devkitbinlibfind-packagesmjs-lines-13–23)
  - [Secondary function — `infra/kb-labs-devkit/src/freshness/metadata.js` (lines 8–11)](#secondary-function-—-infrakb-labs-devkitsrcfreshnessmetadatajs-lines-8–11)
- [Steps](#steps)
  - [Phase 1 — Fix the primary `findPackages` JSDoc](#phase-1-—-fix-the-primary-findpackages-jsdoc)
  - [Phase 2 — Improve the secondary `findPackages` JSDoc](#phase-2-—-improve-the-secondary-findpackages-jsdoc)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
## Task

**A → B:**  
- **A (before):** The canonical `findPackages` function in `infra/kb-labs-devkit/bin/lib/find-packages.mjs` has an incomplete JSDoc with a malformed description (line 17 is a dangling sentence), and the secondary `findPackages` in `infra/kb-labs-devkit/src/freshness/metadata.js` only has a one-liner stub comment.
- **B (after):** Both functions have accurate, complete JSDoc comments that describe what the function does, its parameters, return type, scanning behaviour, and include a usage example.

---

## Current State

### Primary function — `infra/kb-labs-devkit/bin/lib/find-packages.mjs` (lines 13–23)

```js
/**
 * Find all KB Labs packages in the workspace.
 *
 * Scans for kb-labs-* directories in:            ← dangling / orphan sentence
 * Scans root level (flat: kb-labs-*) and category level (platform/kb-labs-*, ...).
 * Also scans apps/ directories for app-style packages.
 *
 * @param {string} rootDir - Workspace root directory
 * @param {string} [filterPackage] - Optional package name filter (e.g., 'core-cli')
 * @returns {string[]} Array of package.json file paths
 */
export function findPackages(rootDir, filterPackage) { ... }
```

Issues:
- Line 17 begins with `"Scans for kb-labs-* directories in:"` and never completes the list — it's an accidental duplicate of the next line left half-finished.
- No `@example` tag showing typical invocation.
- No mention of which `CATEGORIES` are recognised (`platform`, `plugins`, `infra`, `templates`, `installer`, `sites`).
- No note about the silent-catch behaviour when a subdirectory is unreadable.

### Secondary function — `infra/kb-labs-devkit/src/freshness/metadata.js` (lines 8–11)

```js
/**
 * Find all packages in monorepo
 */
export function findPackages(rootDir, filterPackage) { ... }
```

Issues:
- Too brief — no `@param`, `@returns`, or behavioural description.
- Does not document that it only scans the **flat layout** (no category subdirectory support), unlike the primary function.

---

## Steps

### Phase 1 — Fix the primary `findPackages` JSDoc

**File:** `infra/kb-labs-devkit/bin/lib/find-packages.mjs`, lines 13–23

Replace the existing JSDoc block (lines 13–23) with the following corrected and expanded version:

```js
/**
 * Find all KB Labs packages in the workspace.
 *
 * Supports two workspace layouts:
 *  - **Flat layout** — `kb-labs-*` directories directly at `rootDir`.
 *  - **Categorised layout** — `kb-labs-*` directories nested inside a
 *    category folder (`platform/`, `plugins/`, `infra/`, `templates/`,
 *    `installer/`, `sites/`) at `rootDir`.
 *
 * For each discovered repo directory the function scans both a `packages/`
 * and an `apps/` subdirectory and collects every `package.json` it finds.
 * Unreadable directories are silently skipped.
 *
 * All devkit tools should import this helper instead of defining their own
 * package-discovery logic.
 *
 * @param {string} rootDir - Absolute path to the workspace root.
 * @param {string} [filterPackage] - Optional directory name to restrict results
 *   to a single package (e.g. `'core-cli'`). When omitted all packages are returned.
 * @returns {string[]} Absolute paths to every discovered `package.json` file.
 *
 * @example
 * import { findPackages } from './lib/find-packages.mjs';
 *
 * const pkgs = findPackages(process.cwd());
 * // [ '/repo/platform/kb-labs-core/packages/core-cli/package.json', ... ]
 *
 * const single = findPackages(process.cwd(), 'core-cli');
 * // [ '/repo/platform/kb-labs-core/packages/core-cli/package.json' ]
 */
```

This removes the orphan sentence on the old line 17, clearly separates the two layout modes, mentions `apps/` and the silent-skip behaviour, and adds a usage example that mirrors actual call-sites (e.g. `devkit-stats.mjs:405`, `devkit-check-imports.mjs:462`).

### Phase 2 — Improve the secondary `findPackages` JSDoc

**File:** `infra/kb-labs-devkit/src/freshness/metadata.js`, lines 8–10

Replace the one-liner comment with:

```js
/**
 * Find all KB Labs packages in a flat-layout monorepo.
 *
 * Scans for `kb-labs-*` directories directly under `rootDir` (flat layout only —
 * no category-subdirectory support). For each repo directory, collects
 * `package.json` files found inside its `packages/` subdirectory.
 *
 * Used by the freshness-analysis subsystem. For the full workspace scanner
 * (flat + categorised + apps/ support) use `bin/lib/find-packages.mjs` instead.
 *
 * @param {string} rootDir - Absolute path to the workspace root.
 * @param {string} [filterPackage] - Optional directory name to restrict results
 *   to a single package (e.g. `'core-cli'`).
 * @returns {string[]} Absolute paths to every discovered `package.json` file.
 */
```

This documents the important limitation (flat layout only) and cross-references the more capable primary function so future readers understand why two versions exist.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| JSDoc changes introduce a lint error (e.g. malformed tag) | Low | Run `pnpm --filter @kb-labs/devkit lint` before committing; fix any flagged tag syntax |
| Comment description of `CATEGORIES` becomes stale if the constant changes | Low | The comment spells out the list explicitly matching `const CATEGORIES` on line 11; any future change to that constant should also update the comment |
| Missing the secondary function in `metadata.js` | Low | Both files are called out explicitly in this plan |

---

## Verification

After making the edits, confirm no regressions:

```bash
# 1. Verify the primary file parses correctly (no syntax errors introduced)
node --input-type=module < infra/kb-labs-devkit/bin/lib/find-packages.mjs

# 2. Verify the secondary file parses correctly
node infra/kb-labs-devkit/src/freshness/metadata.js

# 3. Run devkit's own lint — expect zero errors/warnings
pnpm --filter @kb-labs/devkit lint

# 4. Run devkit test suite — expect all tests to pass
pnpm --filter @kb-labs/devkit test

# 5. Quick smoke-test: run a devkit tool that imports findPackages
node infra/kb-labs-devkit/bin/devkit-stats.mjs --help
```

Expected outcome for each:
- Commands 1–2: process exits with code 0, no output.
- Command 3: `pnpm lint` prints no errors.
- Command 4: all test suites pass (no failures).
- Command 5: help text prints normally, confirming the import still resolves.

---

## Approval

The plan is ready for user approval.
