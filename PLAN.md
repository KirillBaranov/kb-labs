Now I have a complete picture. Let me write the implementation plan.

## Summary

The `kb workflow runs list` table already has a `Step` column and `currentStepName` computation in the daemon, but the `--workflow` filter flag is silently broken (sent by the CLI but never read by the daemon API), and the `waiting_approval` state doesn't surface a step name. The plan confirms what is complete, fixes the filter gap, and adds the missing approval-step display.

## Root cause / context

`currentStepName` is computed in `workflow-host-service.ts:listRuns` (lines 628–644) by scanning `JobRun.steps` for entries with `status === 'running'`. The Step column in `runs-list.ts:81` already renders it. Three gaps remain:

1. **`workflowId` filter is dead end-to-end.** `http-client.ts:318` sends `?workflowId=…` but the daemon API handler (`workflows-api.ts:219`) only destructures `status`, `limit`, `offset` — the param is silently dropped, and `hostService.listRuns` doesn't accept `workflowId` either.
2. **`waiting_approval` runs show no step name.** When a step is waiting for approval its `status` is `'waiting_approval'`, not `'running'`, so `activeSteps` is empty and `currentStepName` is `undefined` — yet `hasPendingApproval` is `true` and the row shows status icon `…` with an empty Step cell.
3. **Tests CL-11 / CL-12 exist but aren't run against a real daemon** — handler-level coverage is in place but the `--workflow` filter is untested at the handler level.

---

## Implementation steps

### 1. Wire `workflowId` filter through the daemon

**`plugins/workflow/daemon/src/host/workflow-host-service.ts`** — `listRuns` signature and body:

```ts
// Before (line 608):
async listRuns(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<...>

// After:
async listRuns(filters?: {
  status?: string;
  workflowId?: string;   // ← add
  limit?: number;
  offset?: number;
}): Promise<...>
```

After `if (filters?.status)` block (around line 619), add:

```ts
if (filters?.workflowId) {
  runs = runs.filter(run => run.name === filters.workflowId);
}
```

**`plugins/workflow/daemon/src/api/workflows-api.ts`** — GET `/api/v1/runs` handler (line 215–232):

```ts
// Before:
const { status, limit, offset } = request.query;
const response = await ... hostService.listRuns({
  status,
  limit: limit ? parseInt(limit, 10) : 50,
  offset: offset ? parseInt(offset, 10) : 0,
});

// After:
const { status, limit, offset, workflowId } = request.query;   // ← add workflowId
const response = await ... hostService.listRuns({
  status,
  workflowId,           // ← pass through
  limit: limit ? parseInt(limit, 10) : 50,
  offset: offset ? parseInt(offset, 10) : 0,
});
```

Update the route's `Querystring` generic (same block):

```ts
server.get<{
  Querystring: { status?: string; limit?: string; offset?: string; workflowId?: string };
}>('/api/v1/runs', ...)
```

### 2. Show step name for `waiting_approval` steps

**`plugins/workflow/daemon/src/host/workflow-host-service.ts`** — `listRuns` mapping (lines 628–644):

```ts
// Before:
const activeSteps = allSteps.filter(s => s.status === 'running');
let currentStepName: string | undefined;
if (run.status === 'running' && activeSteps.length > 0) {
  currentStepName = activeSteps.length === 1
    ? activeSteps[0]!.name
    : `${activeSteps[0]!.name} (+${activeSteps.length - 1})`;
}

// After:
const activeSteps = allSteps.filter(
  s => s.status === 'running' || s.status === 'waiting_approval',   // ← add waiting_approval
);
let currentStepName: string | undefined;
if (run.status === 'running' && activeSteps.length > 0) {
  currentStepName = activeSteps.length === 1
    ? activeSteps[0]!.name
    : `${activeSteps[0]!.name} (+${activeSteps.length - 1})`;
}
```

**`plugins/workflow/entry/src/commands/runs-list.ts`** — Step cell (line 81): no change needed; already renders `run.currentStepName` when `run.status === 'running'`. The `hasPendingApproval` guard is separate (affects icon, not Step).

### 3. Add handler-level tests for the new scenarios

**`plugins/workflow/entry/src/__tests__/cli/runs-list.cli.test.ts`** — add after CL-12:

```ts
it('CL-13: --workflow filters runs by workflow name', async () => {
  MockedClient.mockImplementation(() => makeClient({
    listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
      expect(params.workflowId).toBe('deploy-prod');
      return [{ id: 'r-dep', name: 'deploy-prod', status: 'success' as const, createdAt: new Date().toISOString() }];
    },
  }));

  const { ui, captured } = createCapturedUI();
  const ctx = createMockContext({ ui });
  const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: { workflow: 'deploy-prod' } }));

  expect(result.exitCode).toBe(0);
  expect(captured.table[0]!.rows.length).toBe(1);
  expect(captured.table[0]!.rows[0]!['Workflow']).toBe('deploy-prod');
});

it('CL-14: RUNNING run with waiting_approval step shows step name', async () => {
  MockedClient.mockImplementation(() => makeClient({
    listRuns: async () => [
      {
        id: 'r-approval',
        name: 'deploy',
        status: 'running' as const,
        createdAt: new Date().toISOString(),
        hasPendingApproval: true,
        currentStepName: 'await-gate',
      },
    ],
  }));

  const { ui, captured } = createCapturedUI();
  const ctx = createMockContext({ ui });
  const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

  expect(result.exitCode).toBe(0);
  const row = captured.table[0]!.rows[0]!;
  expect(row['Step']).toBe('await-gate');
});
```

---

## Tests / verification

```bash
# Run handler tests for the runs-list command
pnpm --filter @kb-labs/workflow-entry run test:cli

# Verify all four relevant cases pass:
# CL-11 — RUNNING + currentStepName → shows in Step column
# CL-12 — non-RUNNING run → Step column empty
# CL-13 — --workflow flag passes workflowId to client (NEW)
# CL-14 — waiting_approval step → currentStepName populated (NEW)
```

For manual end-to-end verification:

```bash
kb-dev start
# Trigger a run that has multiple steps
pnpm kb workflow run <workflow-name>
# While it's running:
pnpm kb workflow runs list
# Expect: Step column shows the active step name (e.g. "build-image")
pnpm kb workflow runs list --workflow <workflow-name>
# Expect: filtered to only that workflow's runs
```
