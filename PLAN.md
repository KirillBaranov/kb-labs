Now I have all the information needed to write the implementation plan.

---

## Summary

Replace 11 inline logger mock objects scattered across `workflow/engine` and `workflow/daemon` test files with `mockLogger()` from `@kb-labs/shared-testing`, which already exists and is fully implemented. Add `@kb-labs/shared-testing` as a `devDependency` to both packages.

---

## Root cause / context

Each workflow test file independently declares its own logger stub — either a bare `noopLogger` object literal (4 methods, no `child`) or a local `createMockLogger()` factory (full `ILogger`). Six `describe` blocks in `worker-lifecycle.e2e.test.ts` each redeclare a `let logger` inline. All of these duplicate what `mockLogger()` in `@kb-labs/shared-testing` already provides: full `ILogger` shape, `vi.fn()` spies, message recording, `child()` propagation, and a `.reset()` method.

Neither `workflow/daemon` nor `workflow/engine` lists `@kb-labs/shared-testing` in `devDependencies`, so the import is currently unavailable.

---

## Implementation steps

### 1. Add `@kb-labs/shared-testing` devDependency

**`plugins/workflow/engine/package.json`** — add to `devDependencies`:
```json
"@kb-labs/shared-testing": "workspace:*"
```

**`plugins/workflow/daemon/package.json`** — add to `devDependencies`:
```json
"@kb-labs/shared-testing": "workspace:*"
```

Run `pnpm install` after both edits to update the lockfile.

---

### 2. `plugins/workflow/engine/src/__tests__/scheduler.test.ts`

- Remove the `noopLogger` object literal (lines ~41–46).
- Add import: `import { mockLogger } from '@kb-labs/shared-testing';`
- Replace every usage of `noopLogger` with `mockLogger()`.
- Remove the `as any` cast where it was needed to paper over the incomplete type (the shared mock satisfies `ILogger` fully).

---

### 3. `plugins/workflow/engine/src/__tests__/state-store.test.ts`

- Remove line ~39: `const noopLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };`
- Add import: `import { mockLogger } from '@kb-labs/shared-testing';`
- Replace `noopLogger as any` with `mockLogger()`.

---

### 4. `plugins/workflow/engine/src/__tests__/concurrency-manager.test.ts`

- Remove line ~25: `const noopLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };`
- Add import: `import { mockLogger } from '@kb-labs/shared-testing';`
- Replace `noopLogger as any` with `mockLogger()`.

---

### 5. `plugins/workflow/engine/src/__tests__/engine.test.ts`

- Remove the `createMockLogger` factory function (lines ~116–125).
- Remove the `import type { ILogger }` from `@kb-labs/core-platform` if it is only used for the now-deleted `createMockLogger` return type (verify before removing).
- Add import: `import { mockLogger, type MockLoggerInstance } from '@kb-labs/shared-testing';`
- Change `let logger: ILogger` → `let logger: MockLoggerInstance`.
- Replace `logger = createMockLogger()` → `logger = mockLogger()`.

---

### 6. `plugins/workflow/daemon/src/__tests__/worker-lifecycle.e2e.test.ts`

This file has 6 `describe` blocks each declaring their own inline `logger` object. Replace the pattern throughout:

- Add import at the top: `import { mockLogger, type MockLoggerInstance } from '@kb-labs/shared-testing';`
- For each of the 6 `describe` blocks, replace the inline object:
  ```ts
  // before
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  ```
  with:
  ```ts
  const logger = mockLogger();
  ```
- The single assertion that accesses `.mock.calls` via a cast (line ~517):
  ```ts
  (logger.info as ReturnType<typeof vi.fn>).mock.calls
  ```
  can be simplified to `logger.info.mock.calls` since `MockLoggerInstance` exposes `info` as a `vi.fn()` spy directly — no cast needed. Update accordingly.
- Remove any `as any` casts on `logger` where it is passed to `createWorkflowWorker`.

---

## Tests / verification

```bash
# 1. Verify lockfile is updated
pnpm install

# 2. Type-check both packages
pnpm --filter @kb-labs/workflow-engine type-check
pnpm --filter @kb-labs/workflow-daemon type-check

# 3. Run unit tests for engine
pnpm --filter @kb-labs/workflow-engine run test

# 4. Run tests for daemon (e2e suite)
pnpm --filter @kb-labs/workflow-daemon run test

# 5. Confirm no inline logger objects remain
grep -r "debug: vi.fn\|createMockLogger\|noopLogger" plugins/workflow/engine/src/__tests__ plugins/workflow/daemon/src/__tests__
# expected: no output
```

All tests should pass without modification to assertions. The `mockLogger()` shape is a superset of every inline mock being replaced, so no behavioral change occurs — only boilerplate is removed.
