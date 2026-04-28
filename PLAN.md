Теперь у меня достаточно информации для детального плана.

---

## Summary

Create a new `@kb-labs/shared-utils` package at `shared/utils/` containing a `formatDuration(ms: number): string` helper with unit tests and a clean package index export.

## Root cause / context

No general-purpose utils package exists in `shared/` — there are domain-specific packages (`shared-http`, `shared-cli-ui`, `shared-command-kit`, etc.) but no generic utility home. The issue requires adding one. The `pnpm-workspace.yaml` already includes the `shared/*` glob, so a new directory there is automatically picked up. All sibling packages follow the same scaffold: ESM, `tsup` build, `vitest` tests, `src/__tests__/*.test.ts` convention.

## Implementation steps

1. **Create `shared/utils/package.json`**
   - `name: "@kb-labs/shared-utils"`, `version: "0.1.0"`, `type: "module"`
   - `main/types` pointing at `./dist/index.js` / `./dist/index.d.ts`
   - `exports: { ".": { types, import } }`
   - `scripts`: `build`, `clean`, `dev`, `lint`, `test`, `type-check` — mirror `shared/http/package.json`
   - `devDependencies`: `@kb-labs/devkit workspace:*`, `@types/node`, `rimraf`, `tsup`, `typescript`, `vitest`
   - No runtime dependencies (pure utility)

2. **Create `shared/utils/tsconfig.json`**
   ```json
   { "extends": "@kb-labs/devkit/tsconfig/node.json",
     "compilerOptions": { "rootDir": "src", "outDir": "dist" },
     "include": ["src"] }
   ```

3. **Create `shared/utils/tsconfig.build.json`**
   ```json
   { "extends": "../../tsconfig.base.json",
     "compilerOptions": { "outDir": "dist", "baseUrl": ".", "paths": {} },
     "include": ["src/**/*"],
     "exclude": ["dist", "node_modules"] }
   ```

4. **Create `shared/utils/tsup.config.ts`**
   - Spread `nodePreset` from `@kb-labs/devkit/tsup/node`
   - `entry: { index: 'src/index.ts' }`, `tsconfig: 'tsconfig.build.json'`
   - `dts: { resolve: true, entry: { index: 'src/index.ts' } }`
   - `external: [/^@kb-labs\/.*/]`

5. **Create `shared/utils/src/format-duration.ts`**
   ```ts
   export function formatDuration(ms: number): string {
     if (ms < 0) ms = 0;
     if (ms < 1000) return `${ms}ms`;
     const seconds = ms / 1000;
     if (seconds < 60) return `${Math.round(seconds)}s`;
     const minutes = Math.floor(seconds / 60);
     const remainingSeconds = Math.round(seconds % 60);
     return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
   }
   ```

6. **Create `shared/utils/src/index.ts`**
   ```ts
   export { formatDuration } from './format-duration.js';
   ```

7. **Create `shared/utils/src/__tests__/format-duration.test.ts`**
   - Import `{ describe, it, expect }` from `'vitest'`
   - `describe('formatDuration', ...)` covering:
     - `0` → `'0ms'`
     - negative (e.g. `-500`) → `'0ms'`
     - `500` → `'500ms'`
     - `999` → `'999ms'`
     - `1000` → `'1s'`
     - `1500` → `'2s'` (rounding)
     - `59000` → `'59s'`
     - `60000` → `'1m'`
     - `90000` → `'1m 30s'`
     - `3600000` → `'60m'`

## Tests / verification

```bash
# From repo root after pnpm install (picks up new package automatically):
pnpm --filter @kb-labs/shared-utils test
# Expected: all cases pass

pnpm --filter @kb-labs/shared-utils type-check
# Expected: no errors

pnpm --filter @kb-labs/shared-utils build
# Expected: dist/index.js + dist/index.d.ts generated
```
