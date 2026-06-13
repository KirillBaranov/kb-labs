Now I have a complete picture. Here is the implementation plan:

---

## Summary

Add a **Step** column to `workflow runs list` output that shows the name of the currently executing step for `RUNNING` runs. The daemon already stores per-step state with `status === 'running'`; the feature requires computing `currentStepName` at query time and surfacing it through the HTTP client to the CLI table renderer.

---

## Root cause / context

`WorkflowRun` stores a full `jobs[].steps[]` tree, and each `StepRun` has its own `status` field. However, the current `GET /api/v1/runs` response shape (`WorkflowRunSummary`) does not include any derived field for the active step — it only carries top-level run metadata. The CLI's `runs-list` table therefore has no data to display per-step progress. For parallel workflows, multiple steps can be `running` simultaneously across different jobs, so the display strategy must handle overflow gracefully.

---

## Implementation steps

### 1. Daemon — compute `currentStepName` in `listRuns()`

**File:** `plugins/workflow/daemon/src/host/workflow-host-service.ts`

In the `.map()` block inside `listRuns()` (around line 628), after the existing `hasPendingApproval` derivation, add:

```ts
const allSteps = (run.jobs ?? []).flatMap(j => j.steps ?? []);
const activeSteps = allSteps.filter(s => s.status === 'running');
let currentStepName: string | undefined;
if (run.status === 'running' && activeSteps.length > 0) {
  currentStepName = activeSteps.length === 1
    ? activeSteps[0]!.name
    : `${activeSteps[0]!.name} (+${activeSteps.length - 1})`;
}
return {
  ...run,
  hasPendingApproval: run.status === 'running' && allSteps.some(s => s.status === 'waiting_approval'),
  currentStepName,
};
```

Update the return type annotation of `listRuns()` to include `currentStepName?: string` in the element type.

### 2. HTTP client — extend `WorkflowRunSummary`

**File:** `plugins/workflow/entry/src/http-client.ts`

Add to the `WorkflowRunSummary` interface (around line 17):

```ts
currentStepName?: string;
```

No change to the fetch logic — the field arrives in the JSON response automatically once the daemon computes it.

### 3. CLI handler — render Step column

**File:** `plugins/workflow/entry/src/commands/runs-list.ts`

In the `ctx.ui?.table?.()` call, add a `Step` field to every row object:

```ts
'Step': run.status === 'running' && run.currentStepName ? run.currentStepName : '',
```

Add a matching column descriptor in the columns array:

```ts
{ header: 'Step', key: 'Step' },
```

Position it between `Status` and `Dur` so the reading order is: icon → name → trigger → when → status → **step** → duration → id.

---

## Tests / verification

### Daemon unit tests

**File:** `plugins/workflow/daemon/src/host/workflow-host-service.test.ts`

Add four cases under an `"OBS: currentStepName"` describe block:

| ID | Scenario | Expected |
|----|----------|----------|
| OBS-006 | Single step `status: 'running'` in a RUNNING run | `currentStepName === step.name` |
| OBS-007 | All steps `status: 'queued'` in a RUNNING run | `currentStepName === undefined` |
| OBS-008 | Completed run (`status: 'success'`) with a formerly-running step | `currentStepName === undefined` |
| OBS-009 | Two steps `status: 'running'` across parallel jobs | `currentStepName === 'firstStep (+1)'` |

### CLI handler tests

**File:** `plugins/workflow/entry/src/__tests__/cli/runs-list.cli.test.ts`

Add two cases:

| ID | Scenario | Expected |
|----|----------|----------|
| CL-11 | `status: 'running'`, `currentStepName: 'build-image'` | `row['Step'] === 'build-image'` |
| CL-12 | `status: 'success'`, no `currentStepName` | `row['Step'] === ''` |

### Manual verification

```bash
# Start the daemon and trigger a multi-step workflow
kb-dev start
pnpm kb workflow run --file .kb/workflows/examples/hello.yml

# In a second terminal, list while the workflow is in progress
pnpm kb workflow runs list

# Expected table row for the in-flight run:
# ◆  hello-world  manual  just now  RUNNING  <step-name>  …  abc12345
```

Confirm the `Step` column is blank for `success` / `failed` rows and shows `name (+N)` when parallel jobs are active.
