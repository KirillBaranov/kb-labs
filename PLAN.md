Now I have everything I need. Here is the implementation plan:

---

## Summary

Add `workflow runs logs <runId>` and `workflow runs status <runId>` as canonical commands under the existing `workflow runs` namespace, then add deprecation warnings to the three legacy top-level commands (`workflow logs`, `workflow status`, `workflow list`) that point users to the new paths.

## Root cause / context

The `workflow runs` group already follows the GitHub CLI namespace pattern and has six subcommands (`list`, `view`, `watch`, `rerun`, `cancel`, `approve`). Two run-scoped operations — fetching logs and checking status — were left as top-level commands (`workflow logs`, `workflow status`) and are inconsistent with this pattern. A third, `workflow list`, is superseded by the already-existing `workflow runs list`. None of the three legacy commands currently emit any deprecation signal.

## Implementation steps

### 1. Add flag definitions — `plugins/workflow/entry/src/flags.ts`

Append two new flag sets at the bottom of the file (before `lintFlags`):

```ts
export const runsLogsFlags = {
  'run-id': { type: 'string', description: 'Run ID (alias for positional argument)' },
  json:     { type: 'boolean', description: OUTPUT_JSON_DESCRIPTION, default: false },
  follow:   { type: 'boolean', description: 'Follow log output', default: false },
  step:     { type: 'string',  description: 'Filter logs to a specific step name' },
  'log-failed': { type: 'boolean', description: 'Show only logs from failed steps', default: false },
} as const;
export type RunsLogsFlags = typeof runsLogsFlags;

export const runsStatusFlags = {
  'run-id': { type: 'string', description: 'Run ID (alias for positional argument)' },
  json:     { type: 'boolean', description: OUTPUT_JSON_DESCRIPTION, default: false },
} as const;
export type RunsStatusFlags = typeof runsStatusFlags;
```

### 2. Create `plugins/workflow/entry/src/commands/runs-logs.ts`

New command, id `workflow:runs-logs`. Takes `argv[0]` or `--run-id`. Calls `client.getRunLogs(runId, { stepId, failedOnly })` (matching the existing `http-client` signature). Renders via the same `renderLogs` helper pattern from `logs.ts`. Validates that a run ID is present (exitCode 1 + validationError if missing).

```ts
// pattern sketch
const runId = flags['run-id'] ?? input.argv?.[0];
if (!runId) {
  validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs logs <runId>', outputJson);
  return { exitCode: 1 };
}
const logs = await client.getRunLogs(runId, {
  stepId: flags.step,
  failedOnly: flags['log-failed'],
});
renderLogs(ctx, logs, outputJson);   // inline or imported helper
```

### 3. Create `plugins/workflow/entry/src/commands/runs-status.ts`

New command, id `workflow:runs-status`. Takes `argv[0]` or `--run-id`. Calls `client.getRun(runId)` (returns full run object with jobs/steps, same shape used by `runs-view`). Renders a status summary (run-level — not job-level like the legacy `workflow status`). Validates run ID present.

```ts
const runId = flags['run-id'] ?? input.argv?.[0];
if (!runId) {
  validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs status <runId>', outputJson);
  return { exitCode: 1 };
}
const run = await client.getRun(runId);
if (outputJson) {
  ctx.ui?.json?.({ ok: true, data: run });
} else {
  // render id, status, workflow, trigger, started, finished, duration, error
}
```

### 4. Add deprecation warnings to three legacy commands

**`plugins/workflow/entry/src/commands/logs.ts`** — add as the first line inside `execute`, before any flag parsing:
```ts
ctx.ui?.warn?.('workflow logs is deprecated; use: kb workflow runs logs <runId>');
```

**`plugins/workflow/entry/src/commands/status.ts`** — same pattern:
```ts
ctx.ui?.warn?.('workflow status is deprecated; use: kb workflow runs status <runId>');
```

**`plugins/workflow/entry/src/commands/list.ts`** — same pattern (emit only when the command is used for run listing, i.e. `typeFilter !== 'cron'`, to avoid a misleading notice when users legitimately do `workflow list --type=cron` which has no `runs` equivalent):
```ts
if (typeFilter !== 'cron') {
  ctx.ui?.warn?.('workflow list is deprecated; use: kb workflow runs list');
}
```

### 5. Register new commands in `plugins/workflow/entry/src/manifest.ts`

**Top of file** — add imports:
```ts
import { runsLogsFlags, runsStatusFlags } from './flags';
```

**In `cli.commands` array**, add two entries after `workflow runs rerun` (or at the end of the Runs category block):

```ts
{
  path: 'workflow runs logs',
  category: 'Runs',
  operationType: 'read' as const,
  describe: 'Fetch logs for a workflow run.',
  longDescription: 'Fetches execution logs for a run. Use --log-failed to show only failed-step logs. Accepts a positional run ID or --run-id flag.',
  handler: './commands/runs-logs.js#default',
  flags: defineCommandFlags(runsLogsFlags),
  examples: [
    'kb workflow runs logs <runId>',
    'kb workflow runs logs <runId> --log-failed',
    'kb workflow runs logs <runId> --step=build --json',
  ],
},
{
  path: 'workflow runs status',
  category: 'Runs',
  operationType: 'read' as const,
  describe: 'Show status summary for a workflow run.',
  longDescription: 'Displays the status of a run including jobs and steps. Accepts a positional run ID or --run-id flag.',
  handler: './commands/runs-status.js#default',
  flags: defineCommandFlags(runsStatusFlags),
  examples: [
    'kb workflow runs status <runId>',
    'kb workflow runs status --run-id=<runId> --json',
  ],
},
```

**Update describe text** for the three deprecated commands to make the canonical path visible in `--help`:
- `workflow status`: `'(Deprecated) Get job status. Use workflow runs status <runId> instead.'`
- `workflow logs`: `'(Deprecated) Get job/run logs. Use workflow runs logs <runId> instead.'`
- `workflow list`: `'(Deprecated) List active executions. Use workflow runs list instead.'`

## Tests / verification

### New command tests

**`plugins/workflow/entry/src/__tests__/cli/runs-logs.cli.test.ts`** — naming prefix `RLG-`:
- `RLG-01`: positional runId → calls `getRunLogs`, exitCode 0, renders log lines
- `RLG-02`: `--run-id` flag form → same behaviour
- `RLG-03`: `--json` → `{ ok: true, data: { logs } }`
- `RLG-04`: no runId (empty argv, no flag) → exitCode 1, error emitted
- `RLG-05`: `--log-failed` → passes `failedOnly: true` to `getRunLogs`
- `RLG-06`: daemon throws → exitCode 1

**`plugins/workflow/entry/src/__tests__/cli/runs-status.cli.test.ts`** — naming prefix `RST-`:
- `RST-01`: positional runId → calls `getRun`, exitCode 0, success rendered
- `RST-02`: `--run-id` flag form → same behaviour
- `RST-03`: `--json` → `{ ok: true, data: <run> }`
- `RST-04`: no runId → exitCode 1, error emitted
- `RST-05`: daemon throws → exitCode 1

### Updated legacy tests (add one case each)

**`logs.cli.test.ts`** — add `CLG-07: emits deprecation warning`:
```ts
expect(captured.warnings.some(w => w.includes('deprecated'))).toBe(true);
```

**`status.cli.test.ts`** (create if it doesn't exist, or add to existing) — add `CST-XX: emits deprecation warning`.

**`list.cli.test.ts`** — add `CLI-XX: emits deprecation warning when listing runs (not cron)`:
```ts
// no --type=cron → deprecation expected
expect(captured.warnings.some(w => w.includes('deprecated'))).toBe(true);
```
And a complementary case: `--type=cron` does NOT emit the deprecation warning.

### Run

```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```

All existing tests must continue to pass. The six new/updated deprecation cases should pass after the code changes.
