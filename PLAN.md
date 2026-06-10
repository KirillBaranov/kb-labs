## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The daemon route already exists; only the CLI layer (command handler, flags, manifest registration, HTTP client method, REST proxy handler, and tests) needs to be created.

---

## Root cause / context

The workflow daemon (`plugins/workflow/daemon/`) already handles `POST /api/v1/runs/:runId/cancel` and returns `{ ok: true, data: { cancelled: true, runId } }` with 404/409 error codes for not-found / already-finished cases. The CLI entry package (`plugins/workflow/entry/`) has no command wired to this endpoint. All other runs commands (`list`, `get`, `logs`) follow a consistent pattern: flags in `flags.ts`, command handler in `commands/`, registration in `manifest.ts`, HTTP client method in `http-client.ts`, and REST proxy handler in `rest/`.

---

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`** — Add `runsCancelFlags` constant and `RunsCancelFlags` interface:
   ```ts
   export const runsCancelFlags = {
     'run-id': { type: 'string', description: 'Run ID to cancel (alias for positional)' },
     json:     { type: 'boolean', description: OUTPUT_JSON_DESCRIPTION, default: false },
   } as const;
   export interface RunsCancelFlags { 'run-id'?: string; json?: boolean; }
   ```

2. **`plugins/workflow/entry/src/http-client.ts`** — Add `cancelRun(runId: string): Promise<void>` method to `WorkflowDaemonClient`:
   ```ts
   async cancelRun(runId: string): Promise<void> {
     const res = await fetch(`${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/cancel`,
       { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
     if (!res.ok) {
       const msg = await res.json().then(j => j?.error ?? '').catch(() => '');
       throw new Error(`Failed to cancel run: ${msg || res.statusText}`);
     }
   }
   ```

3. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** — Create command handler:
   - Accept positional `argv[0]` or `--run-id` flag as run ID; emit `validationError` if neither provided
   - Call `ctx.client.cancelRun(runId)`
   - On success: print human-readable confirmation or `--json` output `{ ok: true, data: { runId, cancelled: true } }`
   - Surface HTTP 404 as "Run not found", 409 as "Run already finished", other errors via `handleError()`

4. **`plugins/workflow/contracts/src/routes.ts`** — Add route constant:
   ```ts
   WORKFLOW_RUN_CANCEL: '/workflows/runs/:runId/cancel',
   ```

5. **`plugins/workflow/entry/src/rest/workflow-run-cancel-handler.ts`** — Create REST proxy handler that forwards `POST /plugins/workflow/workflows/runs/:runId/cancel` → daemon `POST /api/v1/runs/:runId/cancel`, forwarding the response envelope.

6. **`plugins/workflow/entry/src/manifest.ts`** — Register the new command:
   ```ts
   {
     path: 'workflow runs cancel',
     category: 'Runs',
     operationType: 'mutate',
     describe: 'Cancel a workflow run.',
     handler: './commands/runs-cancel.js#default',
     flags: defineCommandFlags(runsCancelFlags),
     examples: [
       'kb workflow runs cancel <runId>',
       'kb workflow runs cancel --run-id=<runId>',
       'kb workflow runs cancel <runId> --json',
     ],
   }
   ```
   Also register the REST handler in the REST routes section.

---

## Tests / verification

**Handler unit test** — `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`:
- Mock `WorkflowDaemonClient.cancelRun` returning `void`; assert human-readable confirmation printed
- Mock with `--json` flag; assert stdout is valid JSON `{ ok: true, data: { runId, cancelled: true } }`
- Stub `cancelRun` to throw `"Run not found"`; assert exit code non-zero and error message
- Stub to throw `"Cannot cancel run in terminal state"`; assert 409 error message
- Call with no positional arg and no `--run-id`; assert validation error without hitting daemon

**REST handler unit test** — `plugins/workflow/entry/src/__tests__/rest/workflow-run-cancel-handler.test.ts`:
- Mock daemon returning 200; assert proxy returns `{ ok: true, data: { cancelled: true, runId } }`
- Mock daemon returning 404/409; assert proxy forwards the error envelope

**Build & type-check:**
```bash
pnpm --filter @kb-labs/workflow-entry type-check
pnpm --filter @kb-labs/workflow-entry run test:cli
```

**Manual smoke test** (with `kb-dev start`):
```bash
# Start a run, grab the ID, then cancel it
kb workflow runs cancel <runId>
kb workflow runs cancel <runId> --json
kb workflow runs cancel non-existent-id   # expect "Run not found"
```
