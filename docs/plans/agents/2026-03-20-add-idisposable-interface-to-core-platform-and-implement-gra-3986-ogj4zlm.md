# Graceful Shutdown: IDisposable Interface & SQLite Adapter Disposal
## Table of Contents
- [Task Summary](#task-summary)
- [Background & Current State](#background-&-current-state)
  - [The existing disposal machinery (don't touch it)](#the-existing-disposal-machinery-dont-touch-it)
  - [SQLite adapter state before this change](#sqlite-adapter-state-before-this-change)
- [Phase 1 — Define `IDisposable` in `core-platform`](#phase-1-—-define-idisposable-in-core-platform)
  - [Step 1.1 — Create `platform/kb-labs-core/packages/core-platform/src/adapters/disposable.ts` (new file)](#step-11-—-create-platformkb-labs-corepackagescore-platformsrcadaptersdisposablets-new-file)
  - [Step 1.2 — Append exports to `platform/kb-labs-core/packages/core-platform/src/adapters/index.ts` (after line 188, end of file)](#step-12-—-append-exports-to-platformkb-labs-corepackagescore-platformsrcadaptersindexts-after-line-188-end-of-file)
  - [Step 1.3 — Append exports to `platform/kb-labs-core/packages/core-platform/src/index.ts` (end of file)](#step-13-—-append-exports-to-platformkb-labs-corepackagescore-platformsrcindexts-end-of-file)
- [Phase 2 — Implement `IDisposable` in `adapters-sqlite`](#phase-2-—-implement-idisposable-in-adapters-sqlite)
  - [Step 2.1 — Add `IDisposable` to the existing import block (lines 39–43)](#step-21-—-add-idisposable-to-the-existing-import-block-lines-39–43)
  - [Step 2.2 — Update class declaration (line 96) and add two private fields immediately after `private closed = false;` (line 98)](#step-22-—-update-class-declaration-line-96-and-add-two-private-fields-immediately-after-private-closed-=-false-line-98)
  - [Step 2.3 — Register synchronous exit handler at the very end of the constructor body (after line 130, before the closing `}`)](#step-23-—-register-synchronous-exit-handler-at-the-very-end-of-the-constructor-body-after-line-130-before-the-closing-})
  - [Step 2.4 — Replace `close()` (lines 220–228) with `dispose()` + updated `close()`](#step-24-—-replace-close-lines-220–228-with-dispose-updated-close)
- [Phase 3 — Implement `IDisposable` in `adapters-analytics-sqlite`](#phase-3-—-implement-idisposable-in-adapters-analytics-sqlite)
  - [Step 3.1 — Add `IDisposable` to the existing import block (line ~17)](#step-31-—-add-idisposable-to-the-existing-import-block-line-17)
  - [Step 3.2 — Update class declaration (line ~129)](#step-32-—-update-class-declaration-line-129)
  - [Step 3.3 — Add `dispose()` immediately after the existing `close()` method (insert after line ~186)](#step-33-—-add-dispose-immediately-after-the-existing-close-method-insert-after-line-186)
- [Phase 4 — Wire Shutdown in `core-runtime/service-bootstrap`](#phase-4-—-wire-shutdown-in-core-runtimeservice-bootstrap)
  - [Step 4.1 — Add `isDisposable` import (after the existing imports block, line 22)](#step-41-—-add-isdisposable-import-after-the-existing-imports-block-line-22)
  - [Step 4.2 — Add module-level flag (after line 27, alongside `_initialized` and `_registeredHooks`)](#step-42-—-add-module-level-flag-after-line-27-alongside-initialized-and-registeredhooks)
  - [Step 4.3 — Add `_ensureSignalHandlers()` helper (insert between `_resolvePlatformRoot` and `_ensureHooksRegistered`, around line 53)](#step-43-—-add-ensuresignalhandlers-helper-insert-between-resolveplatformroot-and-ensurehooksregistered-around-line-53)
  - [Step 4.4 — Replace `_ensureHooksRegistered()` body (lines 54–74) to add `onBeforeShutdown` hook](#step-44-—-replace-ensurehooksregistered-body-lines-54–74-to-add-onbeforeshutdown-hook)
  - [Step 4.5 — Call `_ensureSignalHandlers()` from `createServiceBootstrap()` (insert after line 111)](#step-45-—-call-ensuresignalhandlers-from-createservicebootstrap-insert-after-line-111)
  - [Step 4.6 — Reset the new flag in `resetServiceBootstrap()` (lines 179–183)](#step-46-—-reset-the-new-flag-in-resetservicebootstrap-lines-179–183)
- [Risks & Edge Cases](#risks-&-edge-cases)
- [Verification](#verification)
  - [Build all affected packages](#build-all-affected-packages)
  - [Type-check (catches import and interface mismatches)](#type-check-catches-import-and-interface-mismatches)
  - [Unit tests (verify no regressions)](#unit-tests-verify-no-regressions)
  - [Smoke-test: `IDisposable` exports are reachable at runtime](#smoke-test-idisposable-exports-are-reachable-at-runtime)
  - [Smoke-test: `SQLiteAdapter.dispose()` checkpoints WAL (WAL file absent after close)](#smoke-test-sqliteadapterdispose-checkpoints-wal-wal-file-absent-after-close)
  - [Smoke-test: `isDisposable()` returns `true` for SQLite adapters after build](#smoke-test-isdisposable-returns-true-for-sqlite-adapters-after-build)
- [Approval](#approval)
## Task Summary

**A (Current state):** No `IDisposable` interface exists in the codebase. `SQLiteAdapter` (`adapters-sqlite`) lacks WAL checkpointing and process exit handlers. `SQLiteAnalytics` (`adapters-analytics-sqlite`) already has WAL + signal handlers in `close()` but doesn't expose a typed `dispose()`. The `service-bootstrap.ts` `onShutdown` hook only logs a line — no signal handler triggers `platform.shutdown()`, so adapters are never cleaned up on SIGTERM/SIGINT unless the individual service wires it manually.

**B (Target state):** `IDisposable` is defined and exported from `@kb-labs/core-platform/adapters`. Both SQLite adapters implement it with WAL checkpoint + connection close. `service-bootstrap.ts` registers `SIGTERM`/`SIGINT` handlers that call `platform.shutdown()`, which already iterates all adapters in reverse load order and calls `dispose()` via duck-typing (container.ts lines 816–843).

---

## Background & Current State

### The existing disposal machinery (don't touch it)

`PlatformContainer.shutdown()` in `platform/kb-labs-core/packages/core-runtime/src/container.ts:766` already does everything right once called:

1. Emits `'beforeShutdown'` lifecycle phase (line 767) — `onBeforeShutdown` hooks run
2. Shuts down execution backend, EnvironmentManager, WorkspaceManager, SnapshotManager
3. Iterates `this.adapters` in **reverse load order** (line 817), calling `close()` → `dispose()` → `shutdown()` in that priority (duck-typing, no interface required)
4. Emits `'shutdown'` lifecycle phase (line 846) — `onShutdown` hooks run

**The gap**: nobody calls `platform.shutdown()` on OS signals. `service-bootstrap.ts` (line 64) only registers an `onShutdown` log hook but never triggers the shutdown sequence when SIGTERM/SIGINT arrives. This means databases are abandoned mid-WAL on every deployment restart.

### SQLite adapter state before this change

| File | WAL checkpoint | Process exit handler | `dispose()` method |
|---|---|---|---|
| `infra/kb-labs-adapters/packages/adapters-sqlite/src/index.ts` | ❌ `close()` at line 223 only calls `this.db.close()` | ❌ None | ❌ None |
| `infra/kb-labs-adapters/packages/adapters-analytics-sqlite/src/index.ts` | ✅ `close()` at line 178 calls `wal_checkpoint(TRUNCATE)` | ✅ Constructor registers `exit`/`SIGINT`/`SIGTERM` | ❌ None |

`adapters-log-sqlite` (`LogSQLitePersistence`) delegates to an injected `ISQLDatabase` and never owns a `Database.Database` directly — it needs **no changes**.

---

## Phase 1 — Define `IDisposable` in `core-platform`

**Why**: Both SQLite adapter packages already import types from `@kb-labs/core-platform/adapters`. Adding `IDisposable` there gives them (and any future adapter author) a typed contract to implement, and gives `service-bootstrap` a typed `isDisposable()` guard for observability logging.

### Step 1.1 — Create `platform/kb-labs-core/packages/core-platform/src/adapters/disposable.ts` (new file)

Following the exact style of adjacent adapter files (e.g. `cache.ts`, `storage.ts`):

```typescript
/**
 * Adapter lifecycle interface for graceful shutdown.
 * Adapters that hold OS resources (DB connections, file handles, timers)
 * should implement this to participate in platform.shutdown().
 */
export interface IDisposable {
  /**
   * Release all held resources. Called by core-runtime during graceful shutdown.
   * Must be idempotent (safe to call multiple times).
   */
  dispose(): void | Promise<void>;
}

/** Runtime type guard — use to detect IDisposable without compile-time knowledge. */
export function isDisposable(value: unknown): value is IDisposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as IDisposable).dispose === 'function'
  );
}
```

### Step 1.2 — Append exports to `platform/kb-labs-core/packages/core-platform/src/adapters/index.ts` (after line 188, end of file)

Following the pattern of `generateLogId` at line 113 (mix of `export type` for interfaces and plain `export` for runtime values):

```typescript
// Disposable (graceful shutdown lifecycle)
export type { IDisposable } from './disposable.js';
export { isDisposable } from './disposable.js';
```

### Step 1.3 — Append exports to `platform/kb-labs-core/packages/core-platform/src/index.ts` (end of file)

```typescript
export type { IDisposable } from './adapters/disposable.js';
export { isDisposable } from './adapters/disposable.js';
```

`isDisposable` must use plain `export { }` (not `export type { }`) in both barrel files because it's a runtime function that must survive to JS — same as `generateLogId` and `TIER_ORDER` in the existing codebase.

---

## Phase 2 — Implement `IDisposable` in `adapters-sqlite`

**Why**: `SQLiteAdapter.close()` at line 223 currently skips WAL checkpointing — it just calls `this.db.close()`. In WAL mode, unflushed frames stay in the `.db-wal` file until a subsequent reader checkpoints them. If the process restarts under load (or crashes), the next open may require WAL recovery. Adding `dispose()` with a `TRUNCATE` checkpoint closes this window cleanly.

**File**: `infra/kb-labs-adapters/packages/adapters-sqlite/src/index.ts`

### Step 2.1 — Add `IDisposable` to the existing import block (lines 39–43)

```typescript
import type {
  ISQLDatabase,
  IDisposable,        // ← add
  SQLQueryResult,
  SQLTransaction,
} from "@kb-labs/core-platform/adapters";
```

### Step 2.2 — Update class declaration (line 96) and add two private fields immediately after `private closed = false;` (line 98)

```typescript
export class SQLiteAdapter implements ISQLDatabase, IDisposable {
  private db: Database.Database;
  private closed = false;
  private _onExit: (() => void) | null = null;  // ← add: stored for deregistration
  private _isMemory = false;                    // ← add: skip WAL ops for :memory:
```

### Step 2.3 — Register synchronous exit handler at the very end of the constructor body (after line 130, before the closing `}`)

```typescript
// Register synchronous exit handler only for file-backed, writable, WAL databases.
// process.on('exit') must be sync — better-sqlite3 pragma() is sync, so this is correct.
this._isMemory = resolvedFilename === ':memory:';
if (!this._isMemory && !config.readonly && config.wal !== false) {
  this._onExit = () => { this.dispose(); };
  process.on('exit', this._onExit);
}
```

### Step 2.4 — Replace `close()` (lines 220–228) with `dispose()` + updated `close()`

```typescript
/**
 * Checkpoint WAL and close the database connection. Implements IDisposable.
 * Declared void (not async) because process.on('exit') drops async callbacks.
 * better-sqlite3 is fully synchronous — no async needed here.
 */
dispose(): void {
  if (this.closed) return;
  this.closed = true;
  if (this._onExit) {
    process.removeListener('exit', this._onExit);
    this._onExit = null;
  }
  try {
    if (!this._isMemory && !this.db.readonly) {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    }
    this.db.close();
  } catch {
    // Already closed or I/O error at exit time — nothing we can do.
  }
}

/** Implements ISQLDatabase.close() — delegates to dispose() for WAL checkpoint. */
async close(): Promise<void> {
  this.dispose();
}
```

Note: `dispose()` is synchronous because `process.on('exit')` drops async callbacks silently. The `async close(): Promise<void>` wrapper satisfies the `ISQLDatabase` interface without breaking any callers. The container checks `close` before `dispose` (container.ts line 830), so both code paths reach WAL checkpoint.

---

## Phase 3 — Implement `IDisposable` in `adapters-analytics-sqlite`

**Why**: `SQLiteAnalytics.close()` already does everything correctly — WAL checkpoint, process listener deregistration, and idempotency guard. The only missing piece is a typed `dispose()` so it satisfies the `IDisposable` interface and appears in `isDisposable()` checks.

**File**: `infra/kb-labs-adapters/packages/adapters-analytics-sqlite/src/index.ts`

### Step 3.1 — Add `IDisposable` to the existing import block (line ~17)

```typescript
import type {
  IAnalytics,
  IDisposable,   // ← add
  AnalyticsContext,
  // ... rest unchanged
} from '@kb-labs/core-platform/adapters';
```

### Step 3.2 — Update class declaration (line ~129)

```typescript
export class SQLiteAnalytics implements IAnalytics, IDisposable {
```

### Step 3.3 — Add `dispose()` immediately after the existing `close()` method (insert after line ~186)

```typescript
/**
 * Implements IDisposable — delegates to close().
 * close() already: checkpoints WAL, removes process listeners, and is idempotent.
 */
dispose(): void {
  this.close();
}
```

No logic changes to `close()` are needed — it already does everything correctly.

---

## Phase 4 — Wire Shutdown in `core-runtime/service-bootstrap`

**Why**: `platform.shutdown()` correctly disposes all adapters in the right order, but nothing triggers it on OS signals. Adding signal handlers in the shared bootstrap ensures every service using `createServiceBootstrap()` gets graceful shutdown automatically, without each service needing to wire it manually.

**File**: `platform/kb-labs-core/packages/core-runtime/src/service-bootstrap.ts`

### Step 4.1 — Add `isDisposable` import (after the existing imports block, line 22)

```typescript
import { platform, type PlatformLifecycleHooks, type PlatformLifecycleContext, type PlatformLifecyclePhase } from './container.js';
import { isDisposable } from '@kb-labs/core-platform/adapters';  // ← add
```

### Step 4.2 — Add module-level flag (after line 27, alongside `_initialized` and `_registeredHooks`)

```typescript
let _initialized = false;
const _registeredHooks = new Set<string>();
let _signalHandlersRegistered = false;  // ← add
```

### Step 4.3 — Add `_ensureSignalHandlers()` helper (insert between `_resolvePlatformRoot` and `_ensureHooksRegistered`, around line 53)

```typescript
function _ensureSignalHandlers(appId: string): void {
  if (_signalHandlersRegistered) { return; }
  _signalHandlersRegistered = true;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[${appId}:platform] Received ${signal}, shutting down...\n`);
    try {
      // platform.shutdown() fires 'beforeShutdown' hooks, disposes all adapters in reverse
      // load order (close → dispose → shutdown duck-typing), then fires 'shutdown' hooks.
      await platform.shutdown();
    } catch (err) {
      process.stderr.write(
        `[${appId}:platform] Shutdown error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.once('SIGINT',  () => { void gracefulShutdown('SIGINT'); });
}
```

`process.once()` (not `process.on()`) prevents a second signal from starting another shutdown while the first is still running.

### Step 4.4 — Replace `_ensureHooksRegistered()` body (lines 54–74) to add `onBeforeShutdown` hook

The `container.shutdown()` handles adapter disposal automatically — this hook adds structured observability. Note that `onBeforeShutdown` fires **before** adapters are disposed (container.ts line 767), so the log message "disposing adapters" is correctly in present tense:

```typescript
function _ensureHooksRegistered(appId: string): void {
  if (_registeredHooks.has(appId)) { return; }

  const hooks: PlatformLifecycleHooks = {
    onStart: (ctx: PlatformLifecycleContext) => {
      process.stderr.write(`[${appId}:platform] lifecycle:start cwd=${ctx.cwd}\n`);
    },
    onReady: (ctx: PlatformLifecycleContext) => {
      platform.logger.info('Platform lifecycle ready', { app: appId, durationMs: ctx.metadata?.durationMs });
    },
    onBeforeShutdown: () => {                                          // ← add this hook
      // Log which adapters will be disposed — container.shutdown() handles the actual
      // disposal after this hook returns (container.ts lines 816–843).
      const disposable = platform.listAdapters().filter(k => isDisposable(platform.getAdapter(k)));
      platform.logger.info('Platform lifecycle beforeShutdown', { app: appId, disposableAdapters: disposable });
    },
    onShutdown: () => {
      platform.logger.info('Platform lifecycle shutdown', { app: appId });
    },
    onError: (error: unknown, phase: PlatformLifecyclePhase) => {
      process.stderr.write(`[${appId}:platform] lifecycle:error phase=${phase} ${error instanceof Error ? error.message : String(error)}\n`);
    },
  };

  platform.registerLifecycleHooks(appId, hooks);
  _registeredHooks.add(appId);
}
```

### Step 4.5 — Call `_ensureSignalHandlers()` from `createServiceBootstrap()` (insert after line 111)

```typescript
export async function createServiceBootstrap(options: ServiceBootstrapOptions): Promise<typeof platform> {
  const { appId, repoRoot, storeRawConfig = true, loadEnv = true } = options;

  _ensureHooksRegistered(appId);
  _ensureSignalHandlers(appId);   // ← add this line after _ensureHooksRegistered

  if (_initialized) { return platform; }
  // ... rest of function unchanged ...
}
```

### Step 4.6 — Reset the new flag in `resetServiceBootstrap()` (lines 179–183)

```typescript
export function resetServiceBootstrap(): void {
  _initialized = false;
  _registeredHooks.clear();
  _signalHandlersRegistered = false;  // ← add
  resetPlatform();
}
```

---

## Risks & Edge Cases

| Risk | Mitigation |
|---|---|
| `process.on('exit')` drops async callbacks | `SQLiteAdapter.dispose()` is declared `void` (synchronous) and uses only sync `better-sqlite3` calls. No async is needed. |
| `SQLiteAnalytics` already registers its own SIGINT/SIGTERM handlers | `close()` (called by `dispose()`) calls `process.removeListener()` for all three signals after checkpointing. The `_closed` guard makes double-calling a no-op. |
| Double-dispose if service also calls `platform.shutdown()` manually | All adapters have idempotency guards (`this.closed`, `this._closed`). Double-calling is safe. |
| `:memory:` databases used in test suites | `!this._isMemory` guard prevents WAL checkpoint (no WAL file exists) and skips process listener registration entirely. |
| `_signalHandlersRegistered` leaks between test suites | Phase 4.6 resets it in `resetServiceBootstrap()`. Test suites calling `resetServiceBootstrap()` get clean state. |
| Readonly databases cannot write WAL checkpoint | `if (!this.db.readonly)` guard in Phase 2 Step 2.4 prevents `wal_checkpoint(TRUNCATE)` on readonly connections. |
| `LogSQLitePersistence` wraps `ISQLDatabase` but doesn't own the `Database.Database` connection | When `container.shutdown()` iterates adapters in reverse load order, `LogSQLitePersistence.close()` flushes its write queue first, then `SQLiteAdapter.dispose()` checkpoints WAL. No changes needed to `adapters-log-sqlite`. |
| `onBeforeShutdown` fires BEFORE disposal (container.ts line 767) | The observability log in the hook correctly uses present tense "disposing". Adapters are disposed after the hook returns, between lines 816–843. |

---

## Verification

### Build all affected packages

```bash
pnpm --filter @kb-labs/core-platform build
```
```bash
pnpm --filter @kb-labs/adapters-sqlite build
```
```bash
pnpm --filter @kb-labs/adapters-analytics-sqlite build
```
```bash
pnpm --filter @kb-labs/core-runtime build
```

### Type-check (catches import and interface mismatches)

```bash
pnpm --filter @kb-labs/core-platform exec tsc --noEmit
```
```bash
pnpm --filter @kb-labs/adapters-sqlite exec tsc --noEmit
```
```bash
pnpm --filter @kb-labs/adapters-analytics-sqlite exec tsc --noEmit
```
```bash
pnpm --filter @kb-labs/core-runtime exec tsc --noEmit
```

### Unit tests (verify no regressions)

```bash
pnpm --filter @kb-labs/adapters-sqlite test
```
```bash
pnpm --filter @kb-labs/adapters-analytics-sqlite test
```
```bash
pnpm --filter @kb-labs/core-runtime test
```
```bash
pnpm --filter @kb-labs/core-platform test
```

### Smoke-test: `IDisposable` exports are reachable at runtime

```bash
node -e "import('@kb-labs/core-platform/adapters').then(m => console.log(typeof m.isDisposable))"
# Expected output: function
```
```bash
node -e "import('@kb-labs/core-platform').then(m => console.log(typeof m.isDisposable))"
# Expected output: function
```

### Smoke-test: `SQLiteAdapter.dispose()` checkpoints WAL (WAL file absent after close)

```bash
node --input-type=module << 'EOF'
import { createAdapter } from '@kb-labs/adapters-sqlite';
import { statSync } from 'node:fs';
const db = createAdapter({ filename: '/tmp/test-dispose.db', wal: true });
await db.query('CREATE TABLE IF NOT EXISTS t (x INTEGER)');
await db.query('INSERT INTO t VALUES (1)');
db.dispose();
try { statSync('/tmp/test-dispose.db-wal'); console.log('FAIL: WAL file still present'); }
catch { console.log('PASS: WAL file absent (checkpointed and truncated)'); }
EOF
```

### Smoke-test: `isDisposable()` returns `true` for SQLite adapters after build

```bash
node --input-type=module << 'EOF'
import { createAdapter } from '@kb-labs/adapters-sqlite';
import { isDisposable } from '@kb-labs/core-platform/adapters';
const db = createAdapter({ filename: ':memory:' });
console.log(isDisposable(db) ? 'PASS: SQLiteAdapter implements IDisposable' : 'FAIL');
EOF
```

---

## Approval

このプランはレビューおよび実装の準備ができています。ご確認の上、実施の承認をお願いします。
