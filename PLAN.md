## Summary

Add `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The daemon already supports the operation; only the CLI layer is missing.

## Root cause / context

The workflow daemon (`plugins/workflow/`) already exposes `POST /api/v1/runs/{runId}/cancel`, but no CLI command was registered for it. The `WorkflowDaemonClient` in `http-client.ts` needs a `cancelRun()` method, and the plugin manifest needs a new command entry. All other `runs` subcommands (`list`, `view`, `rerun`, `watch`) establish the exact patterns to follow.

## Implementation steps

1. **`plugins/workflow/entry/src/http-client.ts`** — add `cancelRun(runId: string): Promise<void>` method that sends `POST /api/v1/runs/{encodeURIComponent(runId)}/cancel` and throws a descriptive error on non-2xx response.

2. **`plugins/workflow/entry/src/flags.ts`** — add `runsCancelFlags` const (`'run-id': string`, `json: boolean`) and export `RunsCancelFlags` interface.

3. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** *(new file)* — implement `defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>` with:
   - `intent()`: returns summary string + `delete` operation for audit
   - `execute()`: resolves `runId` from `flags['run-id'] ?? argv[0]`, validates presence, calls `client.cancelRun(runId)`, renders `ctx.ui.success()` (human) or `ctx.ui.json({ ok: true, data: { runId, cancelled: true } })` (--json), delegates errors to `handleError()`

4. **`plugins/workflow/entry/src/manifest.ts`** — import `runsCancelFlags`, add command entry:
   ```
   path: 'workflow runs cancel'
   operationType: 'mutate'
   handler: './commands/runs-cancel.js#default'
   flags: defineCommandFlags(runsCancelFlags)
   ```

5. **`plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`** *(new file)* — 6 test cases using `mockCLIInput` / `createCapturedUI` / `createMockContext` pattern (same as `runs-rerun.cli.test.ts`):
   - `RCX-01` happy path via positional arg
   - `RCX-02` `--json` output shape
   - `RCX-03` `--run-id` flag alias
   - `RCX-04` missing runId → exitCode 1
   - `RCX-05` daemon unreachable → exitCode 1
   - `RCX-06` run not found / already finished → exitCode 1

6. **`plugins/workflow/entry/src/__tests__/helpers/defaults.ts`** — add `cancelRun: async () => {}` stub to `defaultWorkflowClient`.

## Tests / verification

```bash
# Unit tests (no daemon needed)
pnpm --filter @kb-labs/workflow-entry run test:cli

# Manual smoke test (daemon must be running)
kb-dev start
kb workflow runs cancel <some-run-id>
kb workflow runs cancel <some-run-id> --json
kb workflow runs cancel               # expect: error, exitCode 1
kb workflow runs cancel nonexistent-id # expect: error from daemon
```
