## Summary

Consolidate `workflow list`, `workflow logs`, and `workflow status` legacy top-level commands under the `workflow runs` namespace (GitHub CLI style), keeping legacy aliases with deprecation warnings.

## Root cause / context

The workflow plugin grew `kb workflow list/logs/status` as ad-hoc top-level commands before the `runs` sub-namespace existed. Now that `workflow runs` is the canonical pattern (already has `runs list`, `runs view`, `runs watch`, `runs rerun`, `runs cancel`, `runs approve`), the three legacy commands are inconsistent. The issue asks to add `runs logs` and `runs status`, and emit deprecation warnings from the legacy commands pointing users to the new paths.

## Implementation steps

1. **Create `plugins/workflow/entry/src/commands/runs-logs.ts`**
   - Copy flag shape from existing `logs.ts` (`LogsFlags` → rename to `RunsLogsFlags` in `flags.ts`)
   - Accept `--run-id <id>` (or positional `argv[0]`) — drop the job-id path that belongs to `workflow job logs`
   - Call `WorkflowDaemonClient.getRunLogs(runId)` and stream/render output
   - No deprecation warning here (this is the canonical path)

2. **Create `plugins/workflow/entry/src/commands/runs-status.ts`**
   - Copy flag shape from `status.ts` (`StatusFlags` → rename to `RunsStatusFlags` in `flags.ts`)
   - Accept `--run-id <id>` (or positional `argv[0]`)
   - Call `WorkflowDaemonClient.getRun(runId)`, render status summary table
   - No deprecation warning here

3. **Update `plugins/workflow/entry/src/flags.ts`**
   - Add `RunsLogsFlags` interface (mirrors `LogsFlags` but scoped to run-id only)
   - Add `RunsStatusFlags` interface (mirrors `StatusFlags` but scoped to run-id only)

4. **Update `plugins/workflow/entry/src/commands/list.ts`**
   - At top of `execute()`: `ctx.ui?.warn?.('workflow list is deprecated; use: kb workflow runs list')`

5. **Update `plugins/workflow/entry/src/commands/logs.ts`**
   - At top of `execute()`: `ctx.ui?.warn?.('workflow logs is deprecated; use: kb workflow runs logs <runId>')`

6. **Update `plugins/workflow/entry/src/commands/status.ts`**
   - At top of `execute()`: `ctx.ui?.warn?.('workflow status is deprecated; use: kb workflow runs status <runId>')`

7. **Register new commands in `plugins/workflow/entry/src/manifest.ts`**
   - Add entries for `workflow runs logs` and `workflow runs status` alongside existing `runs-*` commands
   - Keep existing `workflow list/logs/status` entries — they stay in the manifest, just with deprecation in their handlers
   - `groupMeta` for `workflow runs` already exists; no change needed there

8. **Update help text in manifest entries** for legacy commands
   - Set `describe` to include `"(deprecated — use workflow runs logs)"` etc.

## Tests / verification

**New handler tests** (one file per new command, matching the pattern in `__tests__/cli/`):

- `plugins/workflow/entry/src/__tests__/cli/runs-logs.cli.test.ts`
  - Happy path: valid `--run-id`, mock client returns logs, exit 0
  - Missing run-id: exit 1 + error message
  - `--json` flag: JSON output format

- `plugins/workflow/entry/src/__tests__/cli/runs-status.cli.test.ts`
  - Happy path: valid `--run-id`, mock client returns run detail, renders table, exit 0
  - Unknown run: client 404 → exit 1 + error message
  - `--json` flag: JSON output format

**Deprecation tests** (add to existing test files):

- `list.cli.test.ts`: assert `capturedUI.warnings` contains the deprecation string
- `logs.cli.test.ts`: same
- `status.cli.test.ts`: same

**Run tests:**
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```
