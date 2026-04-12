# Runbook — DevKit Maintainer

## Audit
- Check for:
  - Local ESLint/TS/Prettier/Vitest/Tsup configs not referencing devkit.
  - package.json scripts that don't use devkit presets.
  - CI not using `KirillBaranov/kb-labs-devkit/.github/workflows/ci.yml@v1` (or @main).
  - Misaligned tsconfig (`inlineSources`, missing `resolveJsonModule`, etc.).

## Patch Plan (example)
1. Replace local `eslint.config.js` with:
   ```js
   import config from '@kb-labs/devkit/eslint/node.js'
   export default config
   ```

2. Replace tsconfig.json to extend from project base, which extends devkit.
3. Update scripts to use devkit presets:
   - build/dev with tsup preset, or local tsup config if entry differs.
   - vitest config centralized: vitest -c ../../vitest.config.ts for packages.
4. CI: use reusable workflow from devkit.

## Validate
- pnpm install
- pnpm lint && pnpm type-check
- pnpm -r run test
- pnpm -r run build

## Notes
- Prefer root vitest config (avoid TS configs under pure ESM).
- Avoid deep imports; ensure "exports" are respected.
