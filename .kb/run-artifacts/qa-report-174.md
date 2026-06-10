---

## Verdict
BUGS_FOUND

## Test Coverage Assessment

- **Tests written**: yes
- **Coverage quality**: adequate (CLI handler) / weak (REST handler)
- **Tests actually catch failures**: yes — all 3 mutations were caught by RCX-04, RCX-05, RCX-06
- **Missing**:
  - No test for whitespace-only runId (`"   "`) — passes `!runId` guard, reaches daemon as a 404
  - No test for `--json` flag combined with an error condition (daemon failure, 409)
  - No test for flag/argv precedence ambiguity (`--run-id=X positional-arg-Y`)
  - **Zero tests for the REST gateway handler** (`workflow-run-cancel-handler.ts`) — the entire proxy layer is untested at the plugin-entry level

## Attack Summary

Tested: whitespace/empty runId, path traversal, very long runId (10k chars), newline log injection, JSON envelope parsing on error paths, concurrent cancel calls on the same run, cancelling already-terminal runs, and the `--json` + error path combination.

## Findings

### [BUG] CLI client swallows structured daemon errors — exposes raw JSON blob to user

- **Type**: runtime bug
- **Attack / observation**: `cancelRun()` in `http-client.ts:381` reads error body with `response.text()` instead of `response.json()`. The daemon returns structured JSON errors like `{"ok":false,"error":"Cannot cancel run with status \"success\""}`. The client wraps this raw blob into the user-facing error.
- **Expected**: User sees `Cannot cancel run with status "success"` (clean, actionable)
- **Actual**: User sees `Failed to cancel run: {"ok":false,"error":"Cannot cancel run with status \"success\""}` (raw JSON noise)
- **Severity**: major — this is the primary failure mode users will hit (cancel a finished run). The REST gateway handler at `rest/workflow-run-cancel-handler.ts:42` correctly uses `response.json()` and extracts `errorData.error`, making this an inconsistency between the two code paths.
- **Reproduce**: `curl -X POST http://localhost:7778/api/v1/runs/<any-finished-runId>/cancel` → returns 409 with JSON body → CLI client reads via `text()` → raw JSON in error message

---

### [MISSING_TEST] No test for REST handler `workflow-run-cancel-handler.ts`

- **Type**: coverage gap
- **Attack / observation**: Searched all test files under `plugins/workflow/entry/src/` — none import or test `workflow-run-cancel-handler.ts`. The gateway proxy layer (auth, routing, daemon forwarding, envelope parsing) has zero handler-level test coverage.
- **Expected**: A handler test verifying 200 success, 404 not-found propagation, 409 terminal-run propagation, and daemon-unavailable behavior
- **Actual**: No such tests exist
- **Severity**: major — an entire code path (CLI → gateway → daemon) goes untested; the client tests only mock the daemon client

---

### [MISSING_TEST] No test for whitespace-only runId

- **Type**: coverage gap
- **Attack / observation**: `if (!runId)` guard at `runs-cancel.ts:27` treats `"   "` (spaces only) as valid. The string is truthy in JavaScript, so it passes validation and reaches the daemon.
- **Expected**: `validationError` triggered, exitCode 1 — same as missing runId
- **Actual**: Request forwarded with runId `"   "`, daemon returns 404 "Run not found" — wrong error message surfaced to user
- **Severity**: minor
- **Reproduce**: Conceptually equivalent to `argv: ['   ']` in a test; `!runId` = `false`, proceeds to daemon

---

### [MISSING_TEST] No test for `--json` + error condition

- **Type**: coverage gap
- **Attack / observation**: RCX-05 and RCX-06 do not pass `flags: { json: true }`. The `handleError(ctx, error, outputJson)` call at `runs-cancel.ts:57` is never exercised with `outputJson=true`. Format of the JSON error output is untested.
- **Expected**: `captured.json` contains a structured error envelope
- **Actual**: Untested
- **Severity**: minor

---

### [WARNING] Inconsistent runId input validation vs job IDs

- **Type**: design inconsistency
- **Attack / observation**: `validateAndEncodeJobId()` at `http-client.ts:163` enforces `^[a-zA-Z0-9_-]+$` regex for job IDs. `cancelRun()` at `http-client.ts:381` does raw `encodeURIComponent(runId)` with no format check. A runId like `../../../etc/passwd` encodes and then gets decoded by Fastify back to the traversal string — safe only because `engine.getRun()` treats it as a lookup key, not a file path. But the inconsistency is fragile.
- **Severity**: minor (no exploitable path traversal confirmed, but inconsistent security posture)

---

## Conclusion

The CLI handler tests are solid — all 6 cases are meaningful and mutations are caught. The primary shippable bug is the raw-JSON-in-error-message for 409 responses (`cancelRun` uses `response.text()` where the REST handler correctly uses `response.json()`). This will confuse users every time they try to cancel a finished run, which is the most common cancel failure mode. The REST handler also lacks any handler-level tests. The feature is functionally correct for the happy path but should not ship without fixing the error message formatting and adding handler tests.

::kb-output::{"verdict":"BUGS_FOUND","bugs_count":1,"report":"The cancel CLI command surfaces raw JSON blobs (e.g. '{\"ok\":false,\"error\":\"...\"}') to users when the daemon returns structured 409/4xx errors — cancelRun() reads error bodies with response.text() while the REST gateway handler correctly uses response.json(). Additionally, the REST gateway handler (workflow-run-cancel-handler.ts) has zero handler-level tests. Happy path and core error paths are functional and mutations are caught by existing tests."}