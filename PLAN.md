Now I have the full picture. Here is the implementation plan:

---

## Summary

Add the `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint and prints a confirmation or a structured error.

## Root cause / context

The workflow daemon already exposes `POST /api/v1/runs/{runId}/cancel`, and `WorkflowDaemonClient.cancelRun()` already wraps that endpoint (`http-client.ts:381`). The only missing piece is a CLI command entry point — a handler file, flag definitions, and a manifest registration — following the same pattern as `runs-rerun` and `runs-view`.

## Implementation steps

### 1. Add flag definitions — `plugins/workflow/entry/src/flags.ts`

Append `runsCancelFlags` after `runsRerunFlags`:

```ts
export const runsCancelFlags = {
  'run-id': { type: 'string', description: 'Run ID to cancel (alias for positional argument)' },
  json:     { type: 'boolean', description: 'Output result as JSON' },
} as const;

export type RunsCancelFlags = typeof runsCancelFlags;
```

### 2. Create command handler — `plugins/workflow/entry/src/commands/runs-cancel.ts`

New file implementing `defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>`:

- `intent()` — returns `{ summary: "Cancel workflow run <id>", operations: [{ type: 'delete', resource: 'workflow-run' }] }`
- `execute()`:
  1. Resolve `runId` from `flags['run-id'] ?? argv[0]`; call `validationError` and return `exitCode: 1` if missing
  2. Instantiate `WorkflowDaemonClient`, call `await client.cancelRun(runId)`
  3. On success: if `--json` → `ctx.ui?.json?.({ ok: true, data: { runId, cancelled: true } })`; else `ctx.ui?.success?.(…)`
  4. On error: `handleError(ctx, error, outputJson)`, return `exitCode: 1`

### 3. Register in manifest — `plugins/workflow/entry/src/manifest.ts`

Import `runsCancelFlags` and add a CLI command entry:

```ts
{
  path: 'workflow runs cancel',
  description: 'Cancel an active workflow run',
  handler: './commands/runs-cancel.js#default',
  flags: defineCommandFlags(runsCancelFlags),
  examples: [
    'kb workflow runs cancel <runId>',
    'kb workflow runs cancel --run-id=<runId>',
    'kb workflow runs cancel <runId> --json',
  ],
}
```

### 4. Write handler tests — `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`

Six test cases (IDs `RCX-01` – `RCX-06`):

| ID | Scenario | Expected |
|----|----------|----------|
| RCX-01 | positional runId, no flags | `exitCode 0`, `cancelRun` called, success message shown |
| RCX-02 | `--json` flag | `exitCode 0`, `captured.json[0]` matches `{ ok: true, data: { runId, cancelled: true } }` |
| RCX-03 | `--run-id=<id>` flag (no positional) | `exitCode 0`, `cancelRun` called with flag value |
| RCX-04 | no runId provided | `exitCode 1`, validation error emitted |
| RCX-05 | daemon unreachable (`ECONNREFUSED`) | `exitCode 1` |
| RCX-06 | daemon returns 404 / already finished | `exitCode 1`, error message shown |

All tests mock `WorkflowDaemonClient` via `vi.mock('../../http-client.js')` and use `makeClient` / `defaultWorkflowClient` from `helpers/defaults.ts`.

## Tests / verification

```bash
# Run handler tests (no daemon needed)
pnpm --filter @kb-labs/workflow-entry run test:cli

# Smoke test against live daemon
kb-dev start
kb workflow runs list          # find a running run ID
kb workflow runs cancel <runId>
kb workflow runs cancel <runId> --json
kb workflow runs cancel nonexistent-id   # should print error, exit 1
```
