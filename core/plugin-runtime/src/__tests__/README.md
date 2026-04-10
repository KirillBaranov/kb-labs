# Plugin Runtime V3 Tests

## Test Suite Overview

This test suite ensures the **core stability** of the V3 plugin system. These tests prevent API drift and verify critical execution paths.

### Test Files

1. **context-factory.test.ts** - Context factory unit tests
2. **context-structure.test.ts** - Runtime structure integration tests
3. **sandbox-runner.test.ts** - Execution runner tests
4. **metadata-injection.test.ts** - Metadata injection unit tests
5. **e2e-context.test.ts** - End-to-end CLI tests
6. **plugin-api.test.ts** - Plugin API tests

## Context Factory Tests

**File:** `context-factory.test.ts`

Unit tests for `createPluginContextV3` - the **critical factory** that creates every plugin context.

### What It Tests

- ✅ All required context fields are present
- ✅ Runtime API correctly wired (17 FS methods)
- ✅ Plugin API correctly wired (lifecycle, state, etc.)
- ✅ Cleanup stack creation
- ✅ Signal propagation
- ✅ Optional fields preservation (tenantId, outdir, config)
- ✅ Unique requestId generation
- ✅ Trace context creation (traceId, spanId)

**Why Critical:** If createPluginContextV3 breaks, **ALL V3 plugins fail**.

## Context Structure Tests

**File:** `context-structure.test.ts`

Integration tests that verify the **actual runtime structure** of `PluginContextV3` passed to plugin handlers.

### Why These Tests Exist

These tests prevent **API drift** between:
- Type definitions (`PluginContextV3` interface)
- Runtime implementation (`createPluginContextV3`)
- Plugin handler expectations

### What They Test

**1. Complete Structure Test**
- Verifies all top-level context keys are present
- Validates metadata fields (host, pluginId, etc.)
- Checks all services are provided:
  - UI facade (13 methods)
  - Platform services (7 services)
  - Runtime API (fs, fetch, env)
  - Plugin API (lifecycle, state, etc.)
- Ensures 17 FS methods are available
- Verifies signal presence

**2. Service Verification**
- UI facade has all expected methods
- Runtime API provides fs, fetch, env
- Plugin API provides lifecycle, state
- Platform services accessible
- Trace context created

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode (useful during development)
pnpm test:watch

# Run specific test file
pnpm vitest run src/__tests__/context-structure.test.ts
```

## Sandbox Runner Tests

**File:** `sandbox-runner.test.ts`

Tests for `runInProcess` and `runInSubprocess` - the **execution entry points** for all V3 plugins.

### What It Tests

**runInProcess (8 tests):**
- ✅ Successful handler execution with auto-injected metadata
- ✅ Handler returning void with metadata injection
- ✅ Invalid handler detection (missing execute function)
- ✅ Cleanup execution after success
- ✅ Cleanup execution after error
- ✅ Signal propagation to context
- ✅ Default export vs named export handling
- ✅ Complete context provided to handler

**runInSubprocess (integration tests):**
- ✅ Bootstrap.js verification (in sandbox-runner.test.ts)
- ✅ Real subprocess execution with IPC (subprocess-integration.test.ts)
- ✅ Timeout handling (subprocess-integration.test.ts)
- ✅ Abort signal handling (subprocess-integration.test.ts)

**Why Critical:** If runner breaks, plugins cannot execute at all.

## Metadata Injection Tests

**File:** `metadata-injection.test.ts`

Unit tests that verify automatic metadata injection in handler results.

### Why These Tests Exist

These tests ensure that the runtime correctly auto-injects standard metadata fields:
- `executedAt` - ISO timestamp when execution started
- `duration` - Execution duration in milliseconds
- `pluginId` - Plugin identifier
- `pluginVersion` - Plugin version
- `commandId` - Command identifier
- `host` - Execution host
- `tenantId` - Tenant identifier
- `requestId` - Request tracking ID

### What They Test

**1. Void Results**
- Metadata injected even when handler returns void
- All standard fields present

**2. Results with Custom Metadata**
- Custom metadata preserved
- Standard fields merged correctly

**3. Metadata Override Behavior**
- Standard fields overwrite custom fields with same name
- Ensures consistent metadata structure

## E2E Context Tests

**File:** `e2e-context.test.ts`

End-to-end tests that run **real handlers** in process execution.

### What It Tests

- ✅ Complete context in real CLI execution
- ✅ Handler execution and exit code
- ✅ Runtime fs API availability
- ✅ Working trace API
- ✅ Platform services availability (llm, logger, embeddings, etc.)

**Why Important:** Tests the complete execution pipeline with real handlers.

## Subprocess Integration Tests

**File:** `subprocess-integration.test.ts`

Integration tests for subprocess execution with real IPC.

### What It Tests

These tests verify:
1. ✅ Real subprocess fork works
2. ✅ IPC communication between parent/child
3. ✅ Metadata injection through subprocess boundary
4. ✅ Timeout and abort handling

**Test Cases:**
- **Subprocess execution with metadata injection** - Forks real child process, creates mock UnixSocket server, verifies context injection and metadata auto-injection works across process boundary
- **Subprocess timeout handling** - Tests handler that never completes, verifies timeout after 1 second with proper error
- **Abort signal handling** - Tests AbortController integration, verifies subprocess can be aborted mid-execution

**Requirements:**
- Built bootstrap.js in dist directory
- Mock UnixSocket server for platform RPC
- Temporary test handlers created on-the-fly

**Why Important:** Validates the production execution path where plugins run in isolated subprocesses.

## Test Coverage Summary

```
Total Tests: 206 (203 passing, 3 skipped)

✅ context-factory.test.ts         - 10 tests (all passing)
✅ context-structure.test.ts       - 8 tests  (all passing)
✅ sandbox-runner.test.ts          - 12 tests (9 passing, 3 skipped)
✅ metadata-injection.test.ts      - 7 tests  (all passing)
✅ e2e-context.test.ts             - 5 tests  (all passing) ⭐ +1 platform test
✅ subprocess-integration.test.ts  - 3 tests  (all passing)
✅ plugin-api.test.ts              - 26 tests (all passing)
✅ runtime-api.test.ts             - 33 tests (all passing)
✅ permissions.test.ts             - 18 tests (all passing)
✅ ipc-protocol.test.ts            - 31 tests (all passing)
✅ trace-context.test.ts           - 14 tests (all passing)
✅ unix-socket-client.test.ts      - 15 tests (all passing)
✅ error-handling.test.ts          - 24 tests (all passing)
... and more
```

### Future Tests to Add

- [ ] Permission enforcement tests (fs, fetch, env)
- [ ] State broker integration tests
- [ ] Runtime shim tests (fs-shim, fetch-shim, env-shim)
- [ ] API module tests (artifacts, shell, events)
- [ ] Error handling tests (PluginError, TimeoutError, etc.)
- [ ] Bootstrap resolution fallback tests (multi-location lookup)

### Debugging Failed Tests

1. **Check the error output** - vitest shows exactly what's missing
2. **Look at real execution** - run a V3 command with debug logging:
   ```bash
   KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3
   ```
3. **Compare structures** - diff test expectations with actual runtime

### CI Integration

These tests run on every commit via:
```bash
pnpm test
```

If tests fail in CI, **do not merge** until:
- Issue is understood
- Fix is implemented OR
- Snapshot is updated with proper justification
