I have all the data I need. Here is the full adversarial QA report:

---

## Verdict
**BUGS_FOUND**

---

## Test Coverage Assessment

- **Tests written**: yes
- **Coverage quality**: adequate for CLI handler; weak for worker execution path
- **Tests actually catch failures**: yes (CLI handler mutations caught) / **no** (worker.ts mutation not caught)
- **Missing**:
  - No test for `--input` receiving invalid JSON (`--input 'not-json'`)
  - No test for `--input 'null'` (null is valid JSON, gets forwarded as `request.input = null`)
  - No test for both `--input` and `--inputs` supplied simultaneously
  - **No runtime test for the `worker.ts` fix at all** — `with.env` coercion is only exercised by unit-level `expressions.test.ts` which simulates the pattern but never calls `worker.ts`

---

## Attack Summary

Attacks performed:
1. **Mutation test 1** — removed `?? input.flags.inputs` fallback from `workflow-run.ts`. CR-08 caught it immediately. ✓
2. **Mutation test 2** — reverted the `coerceToString` fix in `worker.ts` (changed the `Object.fromEntries/coerceToString` spread back to the pre-fix cast). All 78 daemon tests still passed. ✗
3. **Edge-case JSON inputs** — fed `null`, `42`, `true`, `[1,2,3]`, `'not-json'`, deeply nested objects, and empty object to `parseJsonInput`.
4. **Concurrent flag supply** — provided both `--input` and `--inputs` together to observe which wins and whether the user is notified.
5. **API field naming** — verified which field (`input` vs `inputs`) the CLI actually sets on `WorkflowRunRequest`.

---

## Findings

### [MISSING_TEST] worker.ts `with.env` coercion fix has zero runtime coverage
- **Type**: coverage gap / false safety
- **Attack / observation**: Mutated `worker.ts` lines 382–388 to revert the fix (changed `Object.fromEntries(... coerceToString ...)` back to the pre-fix direct cast). Ran all 78 daemon tests. Every test passed.
- **Expected**: At least one test should fail when the actual fix is removed.
- **Actual**: 0 failures. The `expressions.test.ts` tests verify the `coerceToString` function and the coercion pattern at unit level, but no test exercises the code path inside `worker.ts` where `step.spec.with?.['env']` values are coerced before being spread into the shell env. The fix can silently regress.
- **Severity**: major
- **Reproduce**:
  ```
  # Revert line 382-388 in worker.ts to: ...((interpolatedWith?.['env'] as Record<string, string> | undefined) ?? {}),
  pnpm --filter @kb-labs/workflow-daemon run test
  # → 78 passed, 0 failed
  ```

### [MISSING_TEST] Invalid JSON in `--input` is not tested
- **Type**: coverage gap
- **Attack / observation**: `parseJsonInput('not-json')` throws `SyntaxError`. This is caught by the outer `try/catch` in `execute()`, which calls `handleError` and returns `exitCode: 1`. The behavior is correct but untested.
- **Expected**: A test case like `--input 'not valid json'` → `exitCode: 1` with a readable error message.
- **Actual**: No such test exists. If `handleError` is ever changed to swallow the error or if the try/catch is restructured, the regression would go undetected.
- **Severity**: minor
- **Reproduce**: Add test with `input: 'invalid json {{'` and assert `exitCode === 1`.

### [MISSING_TEST] `--input 'null'` silently sets `request.input = null`
- **Type**: coverage gap / potential semantic bug
- **Attack / observation**: `JSON.parse('null')` returns `null`. The guard `if (inputPayload !== undefined)` evaluates `null !== undefined` as `true`, so `request.input = null` is forwarded to the daemon. No test covers this.
- **Expected**: Behaviour for null input should be documented and tested. Sending a literal `null` as `input` is semantically distinct from sending no input at all, but callers would likely not intend this.
- **Actual**: Null flows silently to the daemon. The daemon's `WorkflowRunRequestSchema` accepts `input: z.unknown().optional()` so it doesn't reject it, but the workflow engine receives `inputs: null` (or `input: null`) in the run context.
- **Severity**: minor
- **Reproduce**: `mockCLIInput({ flags: { 'workflow-id': 'x', input: 'null' } })` → observe `capturedRequest.input === null`.

### [MISSING_TEST] Both `--input` and `--inputs` provided — silent winner, no user feedback
- **Type**: coverage gap
- **Attack / observation**: When a user passes both `--input '{"a":1}'` and `--inputs '{"b":2}'`, the code `input.flags.input ?? input.flags.inputs` silently picks `--input`. The `if (input.flags.inputs && !input.flags.input)` guard only fires when `--inputs` is given without `--input`, so the dual-flag case produces no warning and the `--inputs` value is silently dropped.
- **Expected**: Either a warning ("both --input and --inputs provided; --input takes precedence") or a validation error.
- **Actual**: No warning, no error. The user gets a successful run with the wrong payload if they mistakenly provided both.
- **Severity**: minor
- **Reproduce**: `mockCLIInput({ flags: { 'workflow-id': 'x', input: '{"a":1}', inputs: '{"b":2}' } })` → confirm `capturedRequest.input` is `{a:1}` and `captured.warnings.length === 0`.

### [WARNING] CLI sets deprecated `request.input` field, not preferred `request.inputs`
- **Type**: naming inconsistency / maintenance hazard
- **Attack / observation**: `WorkflowRunRequest` has two fields: `inputs?: Record<string, unknown>` (preferred, matches YAML `inputs:` block) and `input?: unknown` (deprecated legacy). The CLI command sets `request.input` (the deprecated field). The issue title is "BUG-001: jq --argjson fails when JSON payload passed via --inputs", implying the fix was meant to correctly route inputs to the workflow — but the CLI continues to populate the legacy field rather than migrating to `inputs`.
- **Expected**: The CLI should set `request.inputs` (the preferred field) if the intent is to align with workflow YAML semantics. At minimum, a comment should acknowledge this deliberate choice.
- **Actual**: `request.input = inputPayload` (line 73). Works at runtime because the daemon accepts both, but is inconsistent with the rest of the codebase's direction.
- **Severity**: minor / informational

---

## Conclusion

The core fix is correct: `coerceToString` is wired into the `with.env` spread in `worker.ts` and prevents `[object Object]` from reaching `jq --argjson`. The `--inputs` → `--input` migration is clean and the deprecation warning is tested. However, the **worker.ts fix itself has no runtime test coverage** — a mutation revert goes completely undetected by all 78 daemon tests. The contracts-level unit tests verify the utility functions but do not exercise the actual worker code path. This is a meaningful regression risk. The remaining gaps (null input, dual-flag conflict, invalid JSON) are low-severity UX/documentation issues.

**Safe to ship? Conditionally.** The functional fix is sound, but the absence of a worker-level integration test for the `with.env` coercion path means the fix could regress silently. A targeted worker test that instantiates a minimal step with `builtin:shell`, `with.env` containing an object input, and asserts the env var is a JSON string (not `[object Object]`) would close this gap before shipping.

---

::kb-output::{"verdict":"BUGS_FOUND","bugs_count":4,"report":"Core fix for jq --argjson is correctly implemented and the --inputs deprecation is properly tested. However, the worker.ts with.env coerceToString fix has zero runtime coverage — a mutation revert passes all 78 daemon tests undetected. Three additional minor gaps: no tests for invalid JSON input, null input forwarding, or dual-flag conflict."}