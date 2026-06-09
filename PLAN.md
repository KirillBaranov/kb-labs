## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The HTTP client already has `cancelRun()`, no daemon changes are needed.

## Root cause / context

The workflow daemon exposes `POST /api/v1/runs/{runId}/cancel` (returns `{ cancelled: true, runId }`, 404 if not found, 409 if already terminal), and `WorkflowDaemonClient.cancelRun()` already wraps it in `http-client.ts`. The only missing piece is the CLI command itself, its flag definitions, and manifest registration.

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`** — Add `runsCancelFlags` export:
   ```ts
   export const runsCancelFlags = {
     'run-id': { type: 'string', description: 'Run ID to cancel' },
     json: { type: 'boolean', description: 'Output result as JSON', default: false },
   } as const;
   export type RunsCancelFlags = typeof runsCancelFlags;
   ```

2. **Create `plugins/workflow/entry/src/commands/runs-cancel.ts`** — Follow the `runs-rerun.ts` pattern:
   - `CLIInput<RunsCancelFlags>` signature
   - `intent()` returning `{ summary, operations: [{ type: 'delete', resource: 'workflow-run' }] }`
   - `execute()`: resolve `runId` from `flags['run-id'] ?? argv[0]`, call `new WorkflowDaemonClient().cancelRun(runId)`, emit `ctx.ui?.success?.(…)` or `ctx.ui?.json?.({ ok: true, data: { cancelled: true, runId } })` on success, `handleError(ctx, error, outputJson)` on failure
   - Map daemon HTTP errors: 404 → "Run not found", 409 → message from daemon ("Cannot cancel run…")

3. **`plugins/workflow/entry/src/manifest.ts`** — Import `runsCancelFlags` and add to `cli.commands`:
   ```ts
   {
     path: 'workflow runs cancel',
     category: 'Runs',
     operationType: 'mutate',
     describe: 'Cancel a running workflow run.',
     handler: './commands/runs-cancel.js#default',
     flags: defineCommandFlags(runsCancelFlags),
     examples: [
       'kb workflow runs cancel <runId>',
       'kb workflow runs cancel --run-id=<runId>',
       'kb workflow runs cancel <runId> --json',
     ],
   }
   ```

4. **`plugins/workflow/entry/src/http-client.ts`** — Update `cancelRun()` to return typed response `{ cancelled: boolean; runId: string }` and surface HTTP error messages (currently swallows the body; read it for 404/409 to pass to `handleError`).

5. **Create `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`** — Following `runs-rerun.cli.test.ts` pattern:
   - `CAN-01`: positional `argv[0]` → success, exitCode 0, `captured.success` non-empty
   - `CAN-02`: `--run-id=<id>` flag → success, exitCode 0
   - `CAN-03`: `--json` flag → `captured.json` contains `{ ok: true, data: { cancelled: true, runId } }`
   - `CAN-04`: missing run ID → exitCode 1, validation error printed
   - `CAN-05`: daemon returns 404 → exitCode 1, "Run not found" message
   - `CAN-06`: daemon returns 409 → exitCode 1, "Cannot cancel run…" message

## Tests / verification

```bash
# Unit tests
pnpm --filter @kb-labs/workflow-entry run test:cli

# Manual smoke test (daemon must be running)
kb-dev start
kb workflow runs list                          # get a run ID
kb workflow runs cancel <runId>                # confirm cancellation message
kb workflow runs cancel <runId> --json         # confirm JSON output
kb workflow runs cancel <runId>                # confirm "already terminal" error on second call
kb workflow runs cancel non-existent-id        # confirm "Run not found" error
```
