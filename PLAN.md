Теперь у меня достаточно данных. Пишу план.

---

## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The HTTP client method `cancelRun()` and the REST proxy handler already exist — only the CLI command, flag definition, manifest entry, and tests are missing.

---

## Root cause / context

The workflow daemon exposes `POST /api/v1/runs/:runId/cancel`. The REST proxy (`workflow-run-cancel-handler.ts`) and the HTTP client method (`WorkflowDaemonClient.cancelRun`) both exist. The gap is purely at the CLI layer: no command file, no flags definition, and no manifest entry for `workflow runs cancel`. The test helper `defaultWorkflowClient` already stubs `cancelRun: async () => {}`, so tests require minimal setup.

One gap in `cancelRun()` in `http-client.ts` (line 381–391): on failure it throws only `response.statusText`, which for a 404 or 409 returns "Not Found" / "Conflict" rather than a user-readable message. This needs to be fixed to satisfy the AC for "run not found or already completed" error messages.

---

## Implementation steps

### 1. `plugins/workflow/entry/src/flags.ts` — add `runsCancelFlags`

Append after the `runsRerunFlags` block (after line 267):

```ts
export const runsCancelFlags = {
  'run-id': {
    type: 'string',
    description: 'Run ID to cancel (alias for positional argument)',
  },
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
} as const;

export type RunsCancelFlags = typeof runsCancelFlags;
```

### 2. `plugins/workflow/entry/src/http-client.ts` — improve `cancelRun` error messages

Replace the current `cancelRun` body (lines 381–391) to parse error responses for 404 and conflict cases:

```ts
async cancelRun(runId: string): Promise<void> {
  const encodedId = encodeURIComponent(runId);
  const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (response.status === 404) {
    throw new Error(`Run ${runId} not found`);
  }
  if (response.status === 409 || response.status === 422) {
    // Daemon returns this when the run has already finished
    let detail = response.statusText;
    try {
      const body = await response.json() as { message?: string };
      if (body.message) detail = body.message;
    } catch { /* ignore parse errors */ }
    throw new Error(`Run ${runId} cannot be cancelled: ${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to cancel run: ${response.statusText}`);
  }
}
```

### 3. `plugins/workflow/entry/src/commands/runs-cancel.ts` — new file

Model after `runs-rerun.ts`. Key points:
- Positional `argv[0]` or `--run-id` flag for the run ID
- `--json` flag for structured output
- No `intent()` needed (straightforward mutate, no dry-run requirement from AC)
- On success: print `Run <runId> cancelled` (plain) or `{ ok: true, data: { runId } }` (JSON)
- On error: delegate to `handleError` from SDK

```ts
import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsCancelFlags {
  'run-id'?: string;
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>({
  id: 'workflow:runs-cancel',
  description: 'Cancel a workflow run',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs cancel <runId> [--run-id=<id>]', outputJson);
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();
        await client.cancelRun(runId);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { runId, cancelled: true } });
        } else {
          ctx.ui?.success?.('Run Cancelled', {
            title: runId,
            sections: [{ header: 'Details', items: [`Run ID: ${runId}`, 'Status: cancelled'] }],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { exitCode: 1 };
      }
    },
  },
});
```

### 4. `plugins/workflow/entry/src/manifest.ts` — register CLI command

**Import** `runsCancelFlags` alongside other flags (line 19):
```ts
  runsCancelFlags,
```

**Add** CLI group description update — change `groupMeta` entry for `workflow runs` to include `cancel`:
```ts
{ path: 'workflow runs', describe: 'Workflow run management (list, view, watch, rerun, cancel)' },
```

**Add** command entry after the `workflow runs rerun` block (after line 238):
```ts
{
  path: 'workflow runs cancel',
  category: 'Runs',
  operationType: 'mutate' as const,
  describe: 'Cancel a running or queued workflow run.',
  longDescription:
    'Cancels a workflow run that is currently running or queued. ' +
    'Prints confirmation on success. If the run is not found or has already finished, an error is shown.',
  handler: './commands/runs-cancel.js#default',
  flags: defineCommandFlags(runsCancelFlags),
  examples: [
    'kb workflow runs cancel <runId>',
    'kb workflow runs cancel --run-id=<runId>',
    'kb workflow runs cancel <runId> --json',
  ],
},
```

### 5. `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts` — new test file

Cover the following cases (ID prefix `CNC`):

| ID | Scenario | Assert |
|---|---|---|
| CNC-01 | Cancel succeeds | `exitCode === 0`, `captured.success.length > 0` |
| CNC-02 | `--json` flag returns `{ ok: true, data: { runId, cancelled: true } }` | `captured.json[0]` matches shape |
| CNC-03 | `--run-id` flag works as alias for positional arg | `exitCode === 0` |
| CNC-04 | Missing run ID → `exitCode === 1`, error printed | `captured.errors.length > 0` |
| CNC-05 | Run not found (client throws "not found") → `exitCode === 1` | `captured.errors.length > 0` |
| CNC-06 | Run already completed (client throws "cannot be cancelled") → `exitCode === 1` | `captured.errors.length > 0` |

---

## Tests / verification

```bash
# Run the new unit tests
pnpm --filter @kb-labs/workflow-entry run test:cli -- --reporter=verbose

# Type-check the package
pnpm --filter @kb-labs/workflow-entry type-check

# Manual smoke test (requires daemon running)
kb-dev start
kb workflow runs list --status=running          # grab a run ID
kb workflow runs cancel <runId>                 # should print confirmation
kb workflow runs cancel <runId> --json          # should print { ok: true, ... }
kb workflow runs cancel nonexistent-id          # should print "not found" error
kb workflow runs cancel <already-done-runId>    # should print "cannot be cancelled" error
```
