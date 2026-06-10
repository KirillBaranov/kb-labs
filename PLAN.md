## Summary

Add `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The daemon endpoint already exists; only the CLI layer (handler, flags, manifest registration, and tests) needs to be added.

## Root cause / context

The workflow daemon already exposes `POST /api/v1/runs/{runId}/cancel` and `WorkflowDaemonClient` in `plugins/workflow/entry/src/http-client.ts` already has a `cancelRun(runId)` method (line ~381). The `runs` command group (`runs list`, `runs view`, `runs rerun`, `runs watch`) lives in `plugins/workflow/entry/src/commands/`. The manifest at `plugins/workflow/entry/src/manifest.ts` wires each handler to a CLI path. Nothing in the CLI layer calls `cancelRun` yet.

## Implementation steps

1. **Add flag type to `plugins/workflow/entry/src/flags.ts`**
   - Add `runsCancelFlags` const with two flags:
     - `run-id` (string, optional): alias for the positional argument
     - `json` (boolean, default false): structured output
   - Export `RunsCancelFlags` interface

2. **Create `plugins/workflow/entry/src/commands/runs-cancel.ts`**
   - Import `defineCommand`, `validationError`, `handleError`, `CLIInput`, `PluginContextV3` from `@kb-labs/sdk`
   - Import `WorkflowDaemonClient` from `../http-client.js`
   - Import `RunsCancelFlags` from `../flags.js`
   - Implement `intent()` — returns a `delete` operation summary for audit
   - Implement `execute()`:
     - Resolve `runId` from `flags['run-id'] ?? argv[0]`; call `validationError` and return `exitCode: 1` if missing
     - Call `await client.cancelRun(runId)`
     - On success with `--json`: `ctx.ui?.json?.({ ok: true, data: { runId, cancelled: true } })`
     - On success without `--json`: `ctx.ui?.success?.(...)` with run ID and hint to use `kb workflow runs view <runId>`
     - On error: `handleError(ctx, error, outputJson)`, return `exitCode: 1`

3. **Register in `plugins/workflow/entry/src/manifest.ts`**
   - Inside the `runs` command group array (after `runs-rerun`), add:
     ```ts
     {
       path: 'workflow runs cancel',
       category: 'Runs',
       operationType: 'mutate',
       describe: 'Cancel a workflow run.',
       longDescription: 'Cancels an active workflow run. If the run is not found or already finished, prints a clear error.',
       handler: './commands/runs-cancel.js#default',
       flags: defineCommandFlags(runsCancelFlags),
       examples: [
         'kb workflow runs cancel <runId>',
         'kb workflow runs cancel --run-id=<runId>',
         'kb workflow runs cancel <runId> --json',
       ],
     }
     ```
   - Add `runsCancelFlags` to the `flags.ts` import at the top of the manifest

## Tests / verification

**Handler unit tests** — `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`

Mock `WorkflowDaemonClient` via `vi.mock`. Six cases:

| ID | Input | Expected |
|----|-------|----------|
| RCX-01 | `argv: ['run-abc']` | `exitCode 0`, `cancelRun` called with `'run-abc'`, success UI shown |
| RCX-02 | `argv: ['run-abc'], flags: { json: true }` | `exitCode 0`, `captured.json[0]` equals `{ ok: true, data: { runId: 'run-abc', cancelled: true } }` |
| RCX-03 | `flags: { 'run-id': 'run-flag-001' }` | `exitCode 0`, `cancelRun` called with `'run-flag-001'` |
| RCX-04 | `argv: [], flags: {}` | `exitCode 1`, validation error in captured output |
| RCX-05 | `cancelRun` rejects with `ECONNREFUSED` | `exitCode 1` |
| RCX-06 | `cancelRun` rejects with `'Not Found'` | `exitCode 1`, error in captured output |

Run with:
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```

**Manual smoke test** (requires running daemon):
```bash
kb-dev start
RUN_ID=$(kb workflow runs list --json | jq -r '.data[0].id')
kb workflow runs cancel "$RUN_ID"
kb workflow runs cancel "$RUN_ID" --json
kb workflow runs cancel nonexistent-id   # should print clear error
```
