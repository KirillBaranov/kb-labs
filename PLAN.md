Теперь у меня достаточно информации для полного плана.

---

## Summary

Add a `currentStepName` field to the `WorkflowRunSummary` type and populate it in the daemon's `listRuns` method by finding the currently-executing step; then display it as a new "Step" column in the `runs list` table, visible only for RUNNING runs.

---

## Root cause / context

The `GET /api/v1/runs` endpoint already returns full `WorkflowRun` objects (with `jobs[].steps[]`) to `workflow-host-service.ts`, but `listRuns` only surfaces `hasPendingApproval` as a derived field — it discards all step-level data before sending the response. The CLI's `runs-list.ts` therefore has no step information to display. The data is available; it just isn't forwarded.

---

## Implementation steps

### 1. Add `currentStepName` to `WorkflowRunSummary` — `plugins/workflow/entry/src/http-client.ts` lines 15–31

Add one optional field to the interface:
```ts
currentStepName?: string;   // name of the actively-executing step (RUNNING runs only)
```

### 2. Compute `currentStepName` in the daemon — `plugins/workflow/daemon/src/host/workflow-host-service.ts` lines 589–593

Inside the `.map()` that already computes `hasPendingApproval`, add:

```ts
const allSteps = (run.jobs ?? []).flatMap(j => j.steps ?? []);
const activeStep = allSteps.find(s => s.status === 'running');
// …
currentStepName: run.status === 'running' ? (activeStep?.name ?? undefined) : undefined,
```

Return type becomes `WorkflowRun & { hasPendingApproval: boolean; currentStepName?: string }`.

### 3. Propagate `currentStepName` through the API response type — `plugins/workflow/daemon/src/host/workflow-host-service.ts` line 573

Update the `Promise<…>` return type annotation to include `currentStepName?: string`.

### 4. Add "Step" column to the CLI table — `plugins/workflow/entry/src/commands/runs-list.ts` lines 72–94

In the `runs.map()` row builder (after `'Status'`):

```ts
'Step': run.status === 'running' && run.currentStepName ? run.currentStepName : '',
```

Add the column descriptor after `'Status'`:
```ts
{ header: 'Step', key: 'Step' },
```

Place it between `'Status'` and `'Dur'` so it only occupies space when non-empty; since `ctx.ui?.table` already omits blank columns (or they collapse visually), this is non-disruptive for finished runs.

### 5. Expose `currentStepName` in JSON output (no code change needed)

The JSON path (`ctx.ui?.json?.({ ok: true, data: runs })`) already serialises the full `runs` array, so `currentStepName` will appear in `--json` output automatically once step 2 is done.

---

## Tests / verification

**Unit test** (handler level) — `plugins/workflow/entry/src/__tests__/cli/runs-list.test.ts` (create if not present):
- Mock `WorkflowDaemonClient.listRuns` to return one run with `status: 'running'` and `currentStepName: 'build-image'`.
- Assert the rendered table row contains `'build-image'` in the Step column.
- Mock a second run with `status: 'success'` and `currentStepName: undefined`; assert Step column is empty/absent.

**Unit test** (daemon) — in `workflow-host-service.test.ts` or equivalent:
- Provide an engine stub returning a run with `jobs[0].steps = [{ name: 'unit-tests', status: 'running' }, { name: 'deploy', status: 'queued' }]`.
- Assert `listRuns()` result has `currentStepName === 'unit-tests'`.
- For a run with all steps `queued`, assert `currentStepName === undefined`.

**Manual verification**:
```bash
kb-dev start
# start a long-running workflow, then immediately:
pnpm kb runs list
# ➜ RUNNING row should show the active step name in the Step column
pnpm kb runs list --json | jq '.[0].currentStepName'
# ➜ "build-image" (or whatever the active step is)
```
