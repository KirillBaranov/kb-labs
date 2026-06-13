The git history confirms that commit `4836c168` already implemented issue #206 with the same title ("workflow runs list: show current step name for RUNNING runs"). Issue #234 is a follow-on entry in the same epic. All the pieces are in place. I can now write an accurate plan.

---

## Summary

Add a **Step** column to `workflow:runs-list` that, for any run in `RUNNING` status, shows the name of the currently-executing step (or `<first-step> (+N)` when several steps run in parallel). For all other statuses the column is blank.

## Root cause / context

`workflow:runs-list` already renders a `Status` column but gives no visibility into _where_ a running workflow is. Engineers have to open `workflow:runs-status <id>` or tail logs just to know whether a run is still in build, test, or deploy. The fix is straightforward: the engine already tracks per-step status inside `JobRun.steps[]`; we only need to surface it through the list API and the CLI renderer.

Commit `4836c168` landed the full implementation for issue #206 (same title, same epic). Issue #234 is the follow-on tracker. **All code and tests are already in the codebase** — this plan documents the complete design for audit purposes.

## Implementation steps

### 1. Extend `WorkflowRunSummary` with `currentStepName` — `plugins/workflow/entry/src/http-client.ts:17`

Add the optional field to the client-side summary type:

```ts
currentStepName?: string;   // line 33 — already present
```

### 2. Compute `currentStepName` in `WorkflowHostService.listRuns` — `plugins/workflow/daemon/src/host/workflow-host-service.ts:608`

In the per-run mapping loop (lines 628–644):

```ts
const allSteps = (run.jobs ?? []).flatMap(j => j.steps ?? []);
const activeSteps = allSteps.filter(s => s.status === 'running');
let currentStepName: string | undefined;
if (run.status === 'running' && activeSteps.length > 0) {
  currentStepName = activeSteps.length === 1
    ? activeSteps[0]!.name
    : `${activeSteps[0]!.name} (+${activeSteps.length - 1})`;
}
return { ...run, hasPendingApproval: ..., currentStepName };
```

No schema or DB changes required — `currentStepName` is computed on the fly from run state already in memory.

### 3. API endpoint already passes the field through — `plugins/workflow/daemon/src/api/workflows-api.ts:214`

`GET /api/v1/runs` calls `hostService.listRuns()` and returns `ok(response)`. The spread `...run` in step 2 carries `currentStepName` into the JSON response automatically.

### 4. Render `Step` column in the CLI — `plugins/workflow/entry/src/commands/runs-list.ts:81`

```ts
'Step': run.status === 'running' && run.currentStepName ? run.currentStepName : '',
```

Column definition (line 92):
```ts
{ header: 'Step', key: 'Step' },
```

## Tests / verification

### Unit — host service (`plugins/workflow/daemon/src/host/workflow-host-service.test.ts`)

| ID | Scenario | Expected |
|---|---|---|
| OBS-006 | Single active step | `currentStepName === 'build-image'` |
| OBS-007 | All steps queued (none running) | `currentStepName === undefined` |
| OBS-008 | Non-RUNNING run | `currentStepName === undefined` |
| OBS-009 | Two parallel active steps | `currentStepName === 'compile (+1)'` |

Run: `pnpm --filter @kb-labs/workflow-daemon test`

### Handler — CLI renderer (`plugins/workflow/entry/src/__tests__/cli/runs-list.cli.test.ts`)

| ID | Scenario | Expected |
|---|---|---|
| CL-11 | RUNNING run with `currentStepName: 'build-image'` | `row['Step'] === 'build-image'` |
| CL-12 | `success` run, no `currentStepName` | `row['Step'] === ''` |

Run: `pnpm --filter @kb-labs/workflow-entry run test:cli`

### Manual smoke test

```bash
kb-dev start
pnpm kb workflow run <workflow-id>   # trigger a run
pnpm kb workflow runs list            # Step column shows active step name while running
pnpm kb workflow runs list --json     # currentStepName present in JSON output for running runs
```
