The implementation is fully complete on this branch. Here is the accurate plan based on what was actually built:

---

## Summary

Add `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint, confirming cancellation or printing a clear error if the run is not found or already finished.

## Root cause / context

The workflow daemon (`plugins/workflow`) already exposes `POST /api/v1/runs/:runId/cancel` and `WorkflowDaemonClient` already has a `cancelRun(runId)` method. The gap is purely at the CLI layer — no command, flag definition, or manifest entry exists yet for `kb workflow runs cancel`.

Pattern reference: `runs-view`, `runs-list`, `runs-rerun` in `plugins/workflow/entry/src/commands/` show the exact shape to follow.

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`** — add `runsCancelFlags` constant and `RunsCancelFlags` interface (fields: `run-id?: string`, `json?: boolean`) following the same pattern as `runsRerunFlags` above it.

2. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** (new file) — implement `defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>`:
   - Resolve `runId` from `flags['run-id'] ?? argv[0]`; return `exitCode: 1` with `validationError` if missing
   - Call `new WorkflowDaemonClient().cancelRun(runId)`
   - On success: `--json` → `ctx.ui.json({ ok: true, data: { runId, cancelled: true } })`; otherwise `ctx.ui.success('Cancellation Requested', …)`
   - On error: `handleError(ctx, error, outputJson)` → `exitCode: 1` (covers 404 / already-finished / daemon down)

3. **`plugins/workflow/entry/src/manifest.ts`** — register under `path: 'workflow runs cancel'`:
   - `operationType: 'mutate'`
   - `handler: './commands/runs-cancel.js#default'`
   - `flags: defineCommandFlags(runsCancelFlags)`
   - `examples: ['kb workflow runs cancel <runId>', 'kb workflow runs cancel --run-id=<id>', 'kb workflow runs cancel <runId> --json']`

## Tests / verification

**File:** `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`

Use `vi.mock('../../http-client.js')`, `makeClient`, `mockCLIInput`, `createCapturedUI`, `createMockContext` (same helpers as `runs-rerun.cli.test.ts`).

Required cases:
- **RCX-01** — positional `<runId>` → `cancelRun` called, `exitCode: 0`, `captured.success` contains `'Cancellation Requested'`
- **RCX-02** — `--json` flag → `captured.json[0]` matches `{ ok: true, data: { runId, cancelled: true } }`
- **RCX-03** — `--run-id` flag alias works identically to positional arg
- **RCX-04** — no runId provided → `exitCode: 1`, error/warning captured
- **RCX-05** — daemon ECONNREFUSED → `exitCode: 1`
- **RCX-06** — daemon returns 404 / "already finished" error → `exitCode: 1`, error captured

Run with:
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```
