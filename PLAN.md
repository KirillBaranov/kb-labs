## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. This requires a command handler, flags definition, manifest registration, HTTP client method, and handler tests.

## Root cause / context

The workflow daemon already exposes the cancel endpoint, but there is no CLI command wired to it. The pattern for a new runs subcommand is well-established in the codebase: flags in `flags.ts`, handler in `commands/`, registration in `manifest.ts`, and unit tests in `__tests__/cli/`. The HTTP client class `WorkflowDaemonClient` lives in `entry/src/http-client.ts` and already wraps similar fire-and-forget daemon calls (e.g. `rerunRun`).

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`** — add `runsCancelFlags` const and `RunsCancelFlags` interface:
   ```ts
   export const runsCancelFlags = {
     'run-id': { type: 'string', description: 'Run ID (alias for positional argument)' },
     json:     { type: 'boolean', description: 'Output result as JSON', default: false },
   } as const;
   export interface RunsCancelFlags { 'run-id'?: string; json?: boolean; }
   ```

2. **`plugins/workflow/entry/src/http-client.ts`** — add `cancelRun(runId: string): Promise<void>` to `WorkflowDaemonClient`:
   ```ts
   async cancelRun(runId: string): Promise<void> {
     const res = await fetch(
       `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/cancel`,
       { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
     );
     if (!res.ok) {
       const msg = await res.json().then((j: { error?: string }) => j?.error ?? '').catch(() => '');
       throw new Error(`Failed to cancel run: ${msg || res.statusText || res.status}`);
     }
   }
   ```

3. **`plugins/workflow/entry/src/commands/runs-cancel.ts`** — create new file following the `runs-rerun.ts` pattern:
   - Accept `runId` from positional `argv[0]` or `--run-id` flag
   - Validate presence of `runId`; return `exitCode: 1` with clear message if missing
   - Call `client.cancelRun(runId)`
   - On success: print human-readable confirmation or `--json` envelope `{ ok: true, data: { runId, cancelled: true } }`
   - On HTTP error: surface daemon error message (distinguish "not found" / "already finished" from generic errors); return `exitCode: 1`
   - Include `intent()` returning `{ type: 'delete', resource: 'workflow-run' }` for dry-run support

4. **`plugins/workflow/entry/src/manifest.ts`** — register the command in the `commands` array:
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

5. **`plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`** — create test file with cases:
   - **RCX-01** happy path — `cancelRun` called, exit 0, success UI rendered
   - **RCX-02** `--json` flag — output is JSON envelope `{ ok: true, data: { runId, cancelled: true } }`
   - **RCX-03** missing runId — exit 1, validation error message
   - **RCX-04** daemon returns 404 / "not found" error — exit 1, clear error surfaced
   - **RCX-05** daemon returns 409 / "already completed" error — exit 1, clear error surfaced
   - **RCX-06** `--run-id` flag alias — same result as positional argument

## Tests / verification

```bash
# Run handler unit tests (no daemon needed)
pnpm --filter @kb-labs/workflow-entry run test:cli

# Smoke-test against live daemon
kb-dev start
kb workflow runs list            # get a run ID
kb workflow runs cancel <runId>
kb workflow runs cancel <runId> --json
kb workflow runs cancel nonexistent-id   # should print clear error, exit 1
```
