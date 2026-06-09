The implementation is already fully in place. Here is the plan that documents exactly what was done:

---

## Summary

Add `kb workflow runs cancel <runId>` CLI command that calls the existing daemon endpoint `POST /api/v1/runs/{runId}/cancel` and prints a confirmation or a clear error. All four layers needed to wire up a new CLI command in this codebase must be touched.

## Root cause / context

The workflow daemon already exposes `POST /api/v1/runs/{runId}/cancel` but neither the HTTP client wrapper nor the CLI command existed. The gap is purely in the entry-plugin layer (`plugins/workflow/entry`): client method, flags definition, command handler, manifest registration, and tests.

## Implementation steps

1. **`plugins/workflow/entry/src/http-client.ts`** — Add `cancelRun(runId: string): Promise<void>` method that POSTs to `${baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/cancel` with an empty JSON body and throws a descriptive error if the response is not OK.

2. **`plugins/workflow/entry/src/flags.ts`** — Add `runsCancelFlags` constant (`run-id: string`, `json: boolean`) and export `RunsCancelFlags` type.

3. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** — Create the command handler using `defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>`. Resolve `runId` from `argv[0]` or `flags['run-id']`. Call `client.cancelRun(runId)`. On success print `ctx.ui?.success?.(...)` with run ID and a hint to run `kb workflow runs view`; with `--json` emit `{ ok: true, data: { runId, cancelled: true } }`. On any error call `handleError(ctx, error, outputJson)` and return `exitCode: 1`.

4. **`plugins/workflow/entry/src/manifest.ts`** — Register the command:
   ```ts
   {
     path: 'workflow runs cancel',
     category: 'Runs',
     operationType: 'mutate',
     describe: 'Cancel a workflow run.',
     handler: './commands/runs-cancel.js#default',
     flags: defineCommandFlags(runsCancelFlags),
     examples: ['kb workflow runs cancel <runId>', '...--run-id=<runId>', '...<runId> --json'],
   }
   ```

5. **`plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`** — Six handler tests (no daemon required):
   - **RCX-01** — happy path: `cancelRun` called, `captured.success` contains "Cancellation Requested"
   - **RCX-02** — `--json` flag: output is `{ ok: true, data: { runId, cancelled: true } }`
   - **RCX-03** — `--run-id` flag accepted as alias for positional arg
   - **RCX-04** — missing `runId` → `exitCode 1`, validation error surfaced
   - **RCX-05** — daemon `ECONNREFUSED` → `exitCode 1`
   - **RCX-06** — daemon returns "Not Found" (run already finished) → `exitCode 1`, error printed

## Tests / verification

```bash
# Fast unit test — no daemon needed
pnpm --filter @kb-labs/workflow-entry run test:cli

# Manual smoke test (daemon must be running)
kb-dev start
kb workflow runs cancel non-existent-id        # should print error
kb workflow runs cancel <real-run-id>          # should confirm cancellation
kb workflow runs cancel <real-run-id> --json   # should output JSON
```
