The command is already fully implemented on this branch. Here is the implementation plan document:

---

## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint and prints a human-readable or `--json` confirmation. The daemon endpoint already exists; only the CLI layer is missing.

---

## Root cause / context

The workflow daemon (`plugins/workflow/`) already exposes `POST /api/v1/runs/{runId}/cancel` and the REST gateway handler for it exists (`rest/workflow-run-cancel-handler.ts`). However, no CLI command was wired up — users were forced to `curl` the endpoint directly. The CLI plugin (`plugins/workflow/entry/`) follows a consistent pattern for all run-level commands (`runs-list`, `runs-view`, `runs-rerun`, `runs-watch`); `runs-cancel` simply was not added to the set.

---

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`** — append `runsCancelFlags` const and `RunsCancelFlags` interface (lines ~270–287):
   ```ts
   export const runsCancelFlags = {
     'run-id': { type: 'string', description: 'Run ID to cancel (alias for positional argument)' },
     json:     { type: 'boolean', description: 'Output result as JSON', default: false },
   } as const;

   export interface RunsCancelFlags {
     'run-id'?: string;
     json?: boolean;
   }
   ```

2. **`plugins/workflow/entry/src/http-client.ts`** — add `cancelRun(runId)` method to `WorkflowDaemonClient` (after existing run methods):
   ```ts
   async cancelRun(runId: string): Promise<void> {
     const encodedId = encodeURIComponent(runId);
     const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/cancel`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: '{}',
     });
     if (!response.ok) {
       const message = await response.json()
         .then((j: { error?: string }) => j?.error ?? '')
         .catch(() => response.text().catch(() => ''));
       throw new Error(`Failed to cancel run: ${message || response.statusText || response.status}`);
     }
   }
   ```

3. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** — create new file:
   - Import `defineCommand`, `validationError`, `handleError`, `CLIInput`, `PluginContextV3` from `@kb-labs/sdk`
   - Import `WorkflowDaemonClient` from `../http-client.js`
   - Import `RunsCancelFlags` from `../flags.js`
   - Export `defineCommand` with:
     - `id: 'workflow:runs-cancel'`
     - `handler.intent` — returns summary + `delete` operation for plan-mode preview
     - `handler.execute` — extracts `runId` from `flags['run-id'] ?? argv[0]`, validates presence, calls `client.cancelRun(runId)`, outputs `ctx.ui.success(...)` or `ctx.ui.json({ ok: true, data: { runId, cancelled: true } })`, catches errors via `handleError`

4. **`plugins/workflow/entry/src/manifest.ts`** — register CLI command in the `runs` command group:
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
   Import `runsCancelFlags` from `./flags.js` at the top.

5. **`plugins/workflow/entry/src/__tests__/helpers/defaults.ts`** — add `cancelRun: vi.fn().mockResolvedValue(undefined)` to `defaultWorkflowClient` stub so new tests can compose from it without boilerplate.

---

## Tests / verification

**Handler tests** — `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`:

| ID | Scenario | Expected |
|----|----------|----------|
| RCX-01 | Positional `argv: ['run-abc']` | `exitCode 0`, `cancelRun` called with `'run-abc'`, `captured.success[0].message` contains `'Cancellation Requested'` |
| RCX-02 | `flags: { json: true }` | `exitCode 0`, `captured.json[0]` matches `{ ok: true, data: { runId: 'run-abc', cancelled: true } }` |
| RCX-03 | `flags: { 'run-id': 'run-flag-001' }`, no positional | `exitCode 0`, `cancelRun` called with `'run-flag-001'` |
| RCX-04 | No runId provided | `exitCode 1`, validation error in `captured.errors` or `captured.warnings` |
| RCX-05 | `cancelRun` rejects with `ECONNREFUSED` | `exitCode 1` |
| RCX-06 | `cancelRun` rejects with `'Failed to cancel run: Not Found'` | `exitCode 1`, non-empty `captured.errors` |

Run with:
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```

**Manual smoke test** (requires `kb-dev start`):
```bash
# Start a run to get a runId
kb workflow runs list

# Cancel it
kb workflow runs cancel <runId>

# Confirm JSON output
kb workflow runs cancel <runId> --json

# Confirm error on unknown ID
kb workflow runs cancel nonexistent-run-id
```
