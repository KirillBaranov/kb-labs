## Summary

Add a "resume from step" capability to the workflow engine: given an existing failed run and a target step ID, reset that step and all subsequent steps in the same job to `queued` (preserving prior step outputs), then re-enqueue the job — so the worker's existing skip-completed logic naturally picks up execution from the target step.

## Root cause / context

The worker's step loop in `daemon/src/worker.ts:280` already skips steps with `status === 'success'`. The gate restart in `applyGateRestart()` (`worker.ts:983–1134`) uses exactly this mechanism: it resets steps from an index onward to `queued`, clears their timing/outputs, and re-enqueues the job — while previously-completed steps stay `success` with their outputs intact.

The existing `runs-rerun` command (`entry/src/commands/runs-rerun.ts`) creates an entirely new run and loses all prior outputs. What's missing is a targeted "resume" path that mutates the existing run in place, analogous to what `applyGateRestart` does — but triggered via CLI/API rather than internally by a gate step.

## Implementation steps

### 1. Contracts — add `ResumeRunInput` type

**File**: `plugins/workflow/contracts/src/schemas.ts`

Add a new schema after the existing `RerunWorkflowRequestSchema`:

```ts
export const ResumeRunRequestSchema = z.object({
  fromStepId: z.string().min(1),  // spec.id of the step to restart from
  jobId: z.string().optional(),    // required only when run has multiple jobs with the same step id
});
export type ResumeRunRequest = z.infer<typeof ResumeRunRequestSchema>;
```

Export it from `plugins/workflow/contracts/src/index.ts`.

### 2. Engine — add `resumeFromStep` helper to state-store

**File**: `plugins/workflow/engine/src/state-store.ts`

Add a method `resetStepsFromIndex(runId, jobId, fromIndex)`:

- Load the run.
- Find the job by `jobId`.
- For each step with `index >= fromIndex`:
  - Set `status = 'queued'`
  - Clear `startedAt`, `finishedAt`, `durationMs`, `error`, `outputs`, `skipReason`
  - Preserve `spec`, `resolvedInputs` (will be re-interpolated by the worker).
- Set the job's `status = 'queued'`, clear `startedAt`, `finishedAt`, `durationMs`, `error`.
- Save and return the updated run.

This is a direct extraction of the same mutation pattern used in `applyGateRestart` (lines 1097–1133).

### 3. Host service — add `resumeRunFromStep` method

**File**: `plugins/workflow/daemon/src/host/workflow-host-service.ts`

Add method `resumeRunFromStep(runId: string, req: ResumeRunRequest)`:

1. Load run via `stateStore.getRun(runId)`. Throw `404` if not found.
2. Validate run status is `failed` or `interrupted` (reject `running` / `success`).
3. Locate the target step:
   - If `req.jobId` is provided, find that job; otherwise scan all jobs.
   - Find the step where `step.spec.id === req.fromStepId`. Throw `400` if not found or if multiple matches without a `jobId`.
4. Validate the step was actually reached (status is not `queued` — must be `running`, `failed`, or `success`).
5. Call `stateStore.resetStepsFromIndex(runId, job.id, step.index)`.
6. Mark the run itself as `queued` (clear `finishedAt`, `durationMs`, set `status = 'running'`).
7. Re-enqueue the job via `scheduler.enqueueJob(run.id, job.id, job.priority ?? 'normal')`.
8. Return the mutated run.

### 4. REST API — new endpoint

**File**: `plugins/workflow/daemon/src/api/workflows-api.ts`

Add after the existing `/runs/:runId/rerun` handler:

```
POST /api/v1/runs/:runId/resume
Body: ResumeRunRequest
Response: 200 Run
```

Parse and validate the body with `ResumeRunRequestSchema`. Delegate to `hostService.resumeRunFromStep(runId, req)`.

### 5. HTTP client — add `resumeRun` method

**File**: `plugins/workflow/client/src/workflow-client.ts` (or wherever `rerunWorkflow` is defined)

```ts
async resumeRun(runId: string, req: ResumeRunRequest): Promise<Run> {
  return this.post(`/api/v1/runs/${runId}/resume`, req);
}
```

Export `ResumeRunRequest` from the client package's public index.

### 6. CLI command — `workflow:runs-resume`

**File**: `plugins/workflow/entry/src/commands/runs-resume.ts` (new file)

Model after `runs-rerun.ts`. Flags:

| Flag | Description |
|---|---|
| `--from-step <stepId>` | Required. The `spec.id` of the step to restart from. |
| `--job-id <jobId>` | Optional. Disambiguate when multiple jobs contain the same step id. |

Flow:
1. Resolve `runId` from positional arg.
2. Validate `--from-step` is provided.
3. Call `client.resumeRun(runId, { fromStepId, jobId })`.
4. Print confirmation: `Run <runId> resuming from step '<stepId>'`.

Register the command in the plugin's manifest / command index.

### 7. Type safety — update `runs view` output (optional, low-risk)

**File**: `plugins/workflow/entry/src/commands/runs-view.ts`

No schema changes needed — the step's `status` and `outputs` fields already exist on `StepRun`. Ensure the view renders `queued` steps as pending (not failed) so resumed runs display correctly. Verify no assumptions about monotonically-increasing step statuses.

## Tests / verification

### Unit test — state mutation

**File**: `plugins/workflow/engine/src/__tests__/state-store.test.ts` (or nearest existing test file)

- Seed a run with 5 steps: steps 0–2 `success` with outputs, step 3 `failed`, step 4 `queued`.
- Call `resetStepsFromIndex(runId, jobId, 3)`.
- Assert: steps 0–2 unchanged (status `success`, outputs intact); steps 3–4 have status `queued`, cleared `startedAt`/`finishedAt`/`outputs`/`error`.

### Unit test — host service validation

**File**: `plugins/workflow/daemon/src/__tests__/host/workflow-host-service.test.ts`

- Running run → expect `400`/`409`.
- Step id not found → expect `400`.
- Step never reached (still `queued`) → expect `400`.
- Happy path → confirm scheduler receives `enqueueJob` call with correct args.

### Handler test — CLI command

**File**: `plugins/workflow/entry/src/__tests__/cli/runs-resume.test.ts`

Using `mockCLIInput` + `createMockContext`:
- Missing `--from-step` → expect validation error printed.
- API returns success → expect success message printed.
- API returns 404 → expect error message printed.

### Manual verification

```bash
# 1. Start a multi-step workflow that fails at step N
kb workflow:run --workflow-id github-issue-to-pr --input '{"issue": "123"}'

# 2. Note the run ID and the failing step id (from kb workflow:runs-view <runId>)
kb workflow:runs-view <runId>

# 3. Resume from the failed step
kb workflow:runs-resume <runId> --from-step <stepId>

# 4. Watch the run — steps before the target should appear as 'success' immediately,
#    and execution should proceed from the target step
kb workflow:runs-view <runId> --watch
```

Expected: the resumed run skips steps 0..N-1 (their outputs appear in context), executes from step N, and completes without re-running prior work.
