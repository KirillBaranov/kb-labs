# ADR-0010: Unified aliases and auto-external for all packages

**Date:** 2025-11-12  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Last Reviewed:** 2025-11-12  
**Tags:** [tooling, architecture]

## Context

Every repository in the ecosystem had to maintain `compilerOptions.paths` in `tsconfig.base.json` and the `external` array in `tsup` by hand. This led to duplication, inconsistencies, and mistakes whenever new packages were added. The goal was to roll out the convenient patterns from `kb-labs-core` across the rest of the projects to reduce maintenance cost and avoid "quick hacks".

## Decision

1. **Generating `tsconfig.paths.json`**
   - `@kb-labs/devkit` now ships with the `kb-devkit-paths` CLI. It scans the pnpm workspace and builds alias mappings `@kb-labs/*` → `packages/*/src` (or `dist`, if a package overrides the default).
   - Each repository keeps a minimal `tsconfig.base.json`:
     ```json
     {
       "extends": [
         "@kb-labs/devkit/tsconfig/<preset>.json",
         "./tsconfig.paths.json"
       ],
       "compilerOptions": {
         "baseUrl": "."
       }
     }
     ```
   - `predevkit:*` scripts invoke `pnpm devkit:paths` so the aliases are always fresh before running any DevKit sync commands.

2. **Automatic `external` in `tsup`**
   - `@kb-labs/devkit/tsup/node.js` now reads the caller's `package.json` and automatically adds everything from `dependencies` and `peerDependencies` to `external`.
   - Packages no longer maintain the list manually. This avoids drift with `package.json` and prevents frequent "extraneous dependency" errors.

3. **Rollout plan**
   - The changes were piloted in `kb-labs-core`. After successful verification the scheme was rolled out to `kb-labs-cli`, `kb-labs-plugin`, `kb-labs-rest-api`, `kb-labs-studio`, `kb-labs-mind`, `kb-labs-devlink`, `kb-labs-release-manager`, `kb-labs-shared`, `kb-labs-ai-review`, `kb-labs-analytics`, `kb-labs-tox`, `kb-labs-ui`, `kb-labs-plugin-template`, and `kb-labs-product-template`.

## Migration

- Add the following scripts to each repository `package.json`:
  ```json
  {
    "scripts": {
      "devkit:paths": "pnpm exec kb-devkit-paths",
      "predevkit:sync": "pnpm devkit:paths",
      "predevkit:sync:ci": "pnpm devkit:paths",
      "predevkit:check": "pnpm devkit:paths",
      "predevkit:force": "pnpm devkit:paths"
    }
  }
  ```
- Update `tsconfig.base.json` as shown above.
- Run `pnpm run devkit:paths` (or `pnpm devkit:paths`) to generate the alias file.

## Consequences

- ✅ Single source of truth for aliases and `external`—less manual maintenance.
- ✅ New packages appear in the alias list automatically after `pnpm devkit:paths`.
- ✅ `tsup` builds no longer fail because of missing `external` entries.
- ⚠️ `kb-devkit-paths` must be available (the project has to depend on the current `@kb-labs/devkit`).
- ⚠️ Custom aliases outside `@kb-labs/*` still need manual entries in `tsconfig.paths.json` or an extension to the generator.

## Next steps

- Optionally integrate the path generator into the `pnpm devkit:sync` workflow so it runs implicitly.
- Expand DevKit documentation with the recommended scripts and the `devkit:paths` execution order (done in this rollout).
- Provide a GitHub Actions recipe (e.g. `devkit-paths-verify`) as part of the infrastructure linting pipeline.
