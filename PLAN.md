---

## Summary

Add a `kb workflow runs cancel <runId>` CLI command that calls the existing `POST /api/v1/runs/{runId}/cancel` daemon endpoint. The daemon already exposes the route; only the CLI layer (command handler, flag definitions, manifest registration, and handler tests) needs to be created.

---

## Root cause / context

The workflow daemon at `:7778` already handles `POST /api/v1/runs/{runId}/cancel`, and `WorkflowDaemonClient` already has a `cancelRun(runId)` method (`http-client.ts:381`). The gap is purely in the CLI layer: no command handler, no flag definitions, and no manifest entry exist for this operation. All sibling commands (`runs list`, `runs view`, `runs rerun`) follow an identical pattern, so the implementation is a straight application of that pattern.

---

## Implementation steps

**1. Add flag definitions — `plugins/workflow/entry/src/flags.ts`**

Append after the last `runs-*` flag block:

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

export interface RunsCancelFlags {
  'run-id'?: string;
  json?: boolean;
}
```

**2. Create command handler — `plugins/workflow/entry/src/commands/runs-cancel.ts`** *(new file)*

```ts
import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { RunsCancelFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>({
  id: 'workflow:runs-cancel',
  description: 'Cancel a workflow run',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      return {
        summary: `Cancel workflow run ${runId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'workflow-run', details: { runId } }],
      };
    },

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
          ctx.ui?.success?.('Cancellation Requested', {
            title: runId,
            sections: [{
              header: 'Details',
              items: [
                `Run ID: ${runId}`,
                `Status: cancellation requested`,
                ``,
                `View: kb workflow runs view ${runId}`,
              ],
            }],
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

Key points:
- `runId` accepted as positional `argv[0]` **or** `--run-id` flag (flag wins if both present)
- `--json` outputs `{ ok: true, data: { runId, cancelled: true } }`
- Any non-2xx response from the daemon is re-thrown by `cancelRun()` as `Error('Failed to cancel run: …')` — caught here, displayed via `handleError`, `exitCode: 1`

**3. Register in manifest — `plugins/workflow/entry/src/manifest.ts`**

Import `runsCancelFlags` at the top alongside sibling flag imports, then add one entry inside the `commands` array (after `runs rerun`, before `workflow run`):

```ts
{
  path: 'workflow runs cancel',
  category: 'Runs',
  operationType: 'mutate' as const,
  describe: 'Cancel a workflow run.',
  longDescription:
    'Cancels an active workflow run. If the run is not found or already finished, prints a clear error.',
  handler: './commands/runs-cancel.js#default',
  flags: defineCommandFlags(runsCancelFlags),
  examples: [
    'kb workflow runs cancel <runId>',
    'kb workflow runs cancel --run-id=<runId>',
    'kb workflow runs cancel <runId> --json',
  ],
},
```

**4. Add handler tests — `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`** *(new file)*

Six cases (IDs `RCX-01` … `RCX-06`):

| ID | Scenario | Assert |
|----|----------|--------|
| RCX-01 | Positional `<runId>`, success | `exitCode 0`, `cancelRun` called with id, `captured.success` contains `'Cancellation Requested'` |
| RCX-02 | `--json` flag | `exitCode 0`, `captured.json[0]` matches `{ ok: true, data: { runId, cancelled: true } }` |
| RCX-03 | `--run-id` alias instead of positional | `exitCode 0`, `cancelRun` called with flag value |
| RCX-04 | No run ID provided | `exitCode 1`, error/warning captured |
| RCX-05 | Daemon unreachable (`ECONNREFUSED`) | `exitCode 1` |
| RCX-06 | Run not found / already finished (daemon returns `Not Found`) | `exitCode 1`, `captured.errors.length > 0` |

Mock pattern (same as sibling tests):
```ts
vi.mock('../../http-client.js', () => ({ WorkflowDaemonClient: vi.fn() }));
MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, cancelRun: vi.fn().mockResolvedValue(undefined) }));
```

---

## Tests / verification

```bash
# Run handler unit tests (no daemon needed)
pnpm --filter @kb-labs/workflow-entry run test:cli

# Type-check the package
pnpm --filter @kb-labs/workflow-entry type-check

# Build
kb-devkit run build --affected

# Clear CLI discovery cache after build
pnpm kb plugins clear-cache

# Manual smoke test (daemon must be running)
kb-dev start
kb workflow runs cancel <runId>
kb workflow runs cancel <runId> --json
kb workflow runs cancel nonexistent-id   # should print error, exit 1
kb workflow runs cancel                   # missing arg, should print usage, exit 1
```
