## Summary

Fix two root causes behind `jq --argjson` failures when a JSON object is passed to a workflow via `--input`: (1) the `interpolateObject` path in `worker.ts` spread `with.env` values without coercing objects to strings, producing `[object Object]` instead of valid JSON; (2) the CLI flag is named `--input` (singular) but users naturally type `--inputs` (plural), which is silently ignored so no payload reaches the workflow at all.

## Root cause / context

### Path 1 — `[object Object]` in shell env vars (serialization bug)

When a workflow step is written as:

```yaml
run: jq --argjson payload '${{ inputs.invoice_payload }}' ...
```

the daemon calls `buildShellSafeCommand` to replace `${{ ... }}` expressions with `_WF_*` env-var references, correctly calling `coerceToString` there. However, when the same object value flows through the **`with.env` spread path** — i.e. the step also has:

```yaml
with:
  env:
    KB_PAYLOAD: "${{ inputs.invoice_payload }}"
```

`worker.ts` (line ~382) spread those values raw (`Record<string, string>`) without passing them through `coerceToString`, so the object landed in the shell env as `[object Object]`. The fix is to apply `coerceToString` to each value in the `with.env` spread, exactly as is already done for `shellEnvVars` and `interpolatedEnv`.

### Path 2 — `--inputs` silently ignored (flag naming bug)

`workflowRunFlags` (flags.ts:138) only defines the key `input` (singular). The CLI framework discards any unrecognised flag, so `--inputs '{"k":"v"}'` is a no-op with no error. The user payload never reaches the daemon. The description now says "use `--input`, not `--inputs`", but that only helps after the user reads the help text — it doesn't prevent the silent failure.

## Implementation steps

### 1. Fix `with.env` coercion in `worker.ts`

**File:** `plugins/workflow/daemon/src/worker.ts` ~line 379

Replace the raw spread of `interpolatedWith?.['env']`:

```ts
// BEFORE
env: {
  ...((interpolatedWith?.['env'] as Record<string, string> | undefined) ?? {}),
  ...shellEnvVars,
},

// AFTER
env: {
  ...Object.fromEntries(
    Object.entries((interpolatedWith?.['env'] as Record<string, unknown> | undefined) ?? {})
      .map(([k, v]) => [k, coerceToString(v)])
  ),
  ...shellEnvVars,
},
```

`coerceToString` is already imported. This is the only change needed in `worker.ts`.

### 2. Add `--inputs` alias in `flags.ts`

**File:** `plugins/workflow/entry/src/flags.ts` ~line 138

Add an `inputs` alias key (or rename to `inputs` and add `input` as alias) so both spellings are accepted:

```ts
input: {
  type: 'string',
  description: 'JSON string of workflow input payload',
  aliases: ['inputs'],   // accept --inputs as alias
},
```

> If the CLI framework does not support `aliases`, add a runtime check in `workflow-run.ts` that reads `input.flags['inputs'] ?? input.flags['input']` and prints a deprecation warning when the plural form is used.

### 3. Handle the alias in `workflow-run.ts`

**File:** `plugins/workflow/entry/src/commands/workflow-run.ts` ~line 66

If aliases are not framework-level, update `WorkflowRunFlagsInput` and the parse call:

```ts
interface WorkflowRunFlagsInput {
  // ...
  input?: string;
  inputs?: string;  // accepted alias — print warning if used
}

// In execute():
const rawInput = input.flags.input ?? input.flags.inputs;
if (input.flags.inputs && !input.flags.input) {
  ctx.ui?.warn?.('--inputs is deprecated; use --input');
}
const inputPayload = parseJsonInput(rawInput);
```

### 4. Add regression tests

**File:** `plugins/workflow/contracts/src/__tests__/expressions.test.ts`

Add a test under `describe('env block coercion (BUG-001 — worker.ts fix)')` that mirrors the `with.env` secondary path (test title: `"with.env object inputs coerced to strings (secondary path — worker.ts:382)"`). Verify that after `coerceToString` is applied to values from `interpolateObject({ env: { KEY: '${{ inputs.obj }}' } }, ctx)`, the result is valid JSON, not `[object Object]`.

**File:** `plugins/workflow/entry/src/__tests__/cli/workflow-run.cli.test.ts`

Add `CR-04`: pass a nested JSON object via `--input` (e.g. `invoice_payload` with nested `line_items`), assert the full object arrives unmodified at `runWorkflow`. This covers the `JSON.parse → object round-trip` path end-to-end at the CLI handler level.

Add `CR-08` (or next available): pass the same payload via `--inputs` (plural), assert it is treated identically to `--input`.

## Tests / verification

```bash
# Unit tests — expressions + worker coercion
pnpm --filter @kb-labs/workflow-contracts run test

# CLI handler tests — flag parsing + request construction
pnpm --filter @kb-labs/workflow-entry run test:cli

# Manual smoke test (daemon running via kb-dev start):
kb workflow:run \
  --workflow-id invoice-approval \
  --input '{"invoice_payload":{"vendor":"Acme","total":250}}'

# Verify the inputs reach the jq step without [object Object]
kb workflow:runs view <run-id> --log
```

The fix is complete when:
- `expressions.test.ts` BUG-001 suite passes with no `[object Object]` in any assertion
- `workflow-run.cli.test.ts` CR-04 + CR-08 pass
- A real workflow using `jq --argjson payload '${{ inputs.invoice_payload }}'` receives valid JSON in the env var and `jq` exits 0
