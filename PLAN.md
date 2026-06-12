Теперь у меня достаточно данных. Напишу план.

---

## Summary

Add a `resume` operation to the workflow engine that restarts a failed run from a specific step, inheriting all prior step outputs — without re-executing steps that already succeeded.

## Root cause / context

Every run is modelled as an immutable snapshot in Redis (`kb:run:<id>`) containing the full `WorkflowRun` tree including per-step `outputs`, `status`, and `resolvedInputs`. The engine already writes step outputs on success, so all state needed for a resumable restart is available — it just isn't used. There is no API endpoint, no engine method, and no CLI command to initiate a partial restart; the only option today is `rerun`, which discards all prior outputs and starts from step 0.

The following new surfaces are required:

| Layer | Change |
|---|---|
| `state-store` | `resetStepsFromIndex(runId, jobId, fromIndex)` — zeroes state for step N onward |
| `engine` | `resumeFromStep(runId, fromStepId, jobId?)` — validates + resets + re-enqueues |
| `contracts` | `WorkflowResumeRequest` schema |
| `daemon/api` | `POST /api/v1/runs/:runId/resume` |
| `host-service` | `resumeRunFromStep()` facade |
| `entry/http-client` | `resumeRun()` |
| `entry/commands` | `runs-resume.ts` CLI command |

## Implementation steps

### 1. `plugins/workflow/engine/src/state-store.ts` — add `resetStepsFromIndex`

Add a method that finds the job by `jobId`, then iterates its `steps` from `fromIndex` (inclusive) and resets each step to `queued` state (clear `startedAt`, `finishedAt`, `durationMs`, `error`, `outputs`). Also reset the enclosing job to `queued` and clear `finishedAt` / `error`. Persist via the existing `updateRun` atomic pattern.

```ts
async resetStepsFromIndex(
  runId: string,
  jobId: string,
  fromIndex: number,
): Promise<WorkflowRun | null>
```

Steps at indices `< fromIndex` are untouched so their `outputs` remain available for expression resolution downstream.

### 2. `plugins/workflow/engine/src/engine.ts` — add `resumeFromStep`

```ts
async resumeFromStep(
  runId: string,
  fromStepId: string,
  jobId?: string,
): Promise<WorkflowRun>
```

Logic:

1. Load run; throw `WorkflowEngineError` if not found.
2. Guard: reject if `run.status` is `'running'` or `'queued'` (active run — caller must cancel first).
3. Guard: reject if `run.status` is `'success'` (nothing to resume).
4. Locate target step:
   - If `jobId` supplied, search only that job.
   - Otherwise search all jobs; if more than one job contains a step with `spec.id === fromStepId`, throw an ambiguity error asking the caller to supply `--job-id`.
5. Guard: reject if `targetStep.status === 'queued'` (step was never executed — nothing to re-run from here).
6. Call `this.stateStore.resetStepsFromIndex(runId, job.id, targetStep.index)`.
7. Patch run: clear `finishedAt`, `durationMs`, `result`; set `status = 'running'`.
8. Save via `updateRun`.
9. Call `this.scheduler.enqueueJob(runId, job.id, job.priority ?? 'normal')`.
10. Publish `EVENT_NAMES.run.resumed` event (new event name).
11. Return the updated run.

### 3. `plugins/workflow/contracts/src/rest-api.ts` — add request/response types

```ts
export interface WorkflowResumeRequest {
  fromStepId: string;   // spec.id of the step to restart from
  jobId?: string;       // disambiguate when same spec.id exists in multiple jobs
}
```

Response reuses the existing `{ runId: string; status: string }` shape (same as `rerun`).

### 4. `plugins/workflow/daemon/src/host/workflow-host-service.ts` — add facade method

```ts
async resumeRunFromStep(
  runId: string,
  request: WorkflowResumeRequest,
): Promise<{ runId: string; status: string }> {
  const resolved = await this.resolveRunId(runId);
  const run = await this.engine.resumeFromStep(
    resolved, request.fromStepId, request.jobId,
  );
  return { runId: run.id, status: run.status };
}
```

Map engine errors to HTTP 400/404 in the API layer (next step).

### 5. `plugins/workflow/daemon/src/api/workflows-api.ts` — register HTTP endpoint

Register `POST /api/v1/runs/:runId/resume` after the existing `/cancel` and `/rerun` handlers:

```ts
router.post('/runs/:runId/resume', async (req, res) => {
  const { runId } = req.params;
  const body = req.body as WorkflowResumeRequest;
  try {
    const result = await hostService.resumeRunFromStep(runId, body);
    res.json(result);
  } catch (err) {
    if (err instanceof WorkflowEngineError) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});
```

### 6. `plugins/workflow/entry/src/http-client.ts` — add `resumeRun`

```ts
async resumeRun(
  runId: string,
  request: WorkflowResumeRequest,
): Promise<{ runId: string; status: string }> {
  return this.post(`/api/v1/runs/${runId}/resume`, request);
}
```

### 7. `plugins/workflow/entry/src/commands/runs-resume.ts` — new CLI command

```
kb workflow runs resume <runId> --from-step <stepId> [--job-id <jobId>] [--json]
```

- `runId`: positional argument (required).
- `--from-step`: step `spec.id` to restart from (required).
- `--job-id`: optional disambiguation.
- `--json`: machine-readable output.

Use the standard `defineCommand` / `intent` + `execute` pattern from the SDK. In `execute()`:

1. Parse positional `runId` and flag `fromStep`.
2. Validate both are non-empty; throw `CLIError` otherwise.
3. Call `client.resumeRun(runId, { fromStepId: fromStep, jobId })`.
4. Render success or JSON output.

### 8. `plugins/workflow/entry/src/manifest.ts` — register command

Add `runs-resume` to the `runs` command group's subcommand list.

### 9. `plugins/workflow/entry/src/flags.ts` — add shared flag definitions

Add `fromStep` (string, required-when-used) and optionally `jobId` to the shared flags map if other commands may reuse them.

## Tests / verification

### Unit — state store (`engine/src/__tests__/state-store.test.ts`)

- **Happy path**: create a run with 3 steps (all `success`), call `resetStepsFromIndex(fromIndex=1)`, assert step[0] unchanged, step[1] and step[2] are `queued` with cleared `outputs`/`error`/timestamps, job is `queued`.
- **Boundary**: `fromIndex === 0` resets all steps.
- **No-op guard**: `fromIndex >= steps.length` returns unchanged run.

### Unit — engine (`engine/src/__tests__/engine.test.ts`)

- `resumeFromStep` on an active (`running`) run throws.
- `resumeFromStep` on a `success` run throws.
- `resumeFromStep` with unexecuted step (`queued`) throws.
- `resumeFromStep` with ambiguous step ID (no `jobId`) throws.
- Happy path: failed run, step[1] failed → resume from step[1] → run is `running`, scheduler receives enqueue call, steps[0] outputs preserved.

### Handler test — CLI (`entry/src/__tests__/cli/runs-resume.cli.test.ts`)

Use `mockCLIInput<ResumeFlags>()` + `createMockContext()` pattern. Test:

- Missing `--from-step` flag → `CLIError`.
- Successful call → `client.resumeRun()` called with correct args → success output.
- API 400 error → clear message printed.
- `--json` flag → machine-readable JSON output.

### Integration / manual

```bash
# Start a known-failing 3-step workflow run, capture its runId
kb workflow runs list --status failed

# Inspect step IDs
kb workflow runs get <runId> --json | jq '.jobs[0].steps'

# Resume from step 2
kb workflow runs resume <runId> --from-step step-2-spec-id

# Verify run is running and step[0] output is preserved
kb workflow runs get <runId> --json | jq '.jobs[0].steps[0].outputs'
```

Daemon logs should show `[engine] resumeFromStep runId=<id> fromStepId=step-2-spec-id` and subsequent step execution events starting from step 2.
