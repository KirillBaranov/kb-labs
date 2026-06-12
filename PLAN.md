## Resumable Pipeline Runs: Restart from a Specific Step

## Summary

Add a `kb workflow runs-restart <runId> --from-step <stepId>` command that restores a failed run's completed step outputs from a snapshot and re-executes only from the specified step onward. The engine already has a `replayRun(runId, { fromStepId })` method, but snapshots are never automatically saved, and no CLI/HTTP surface exposes step-level restart.

---

## Root Cause / Context

Three gaps exist between the desired UX and the current code:

1. **Snapshots are never saved automatically.** `RunSnapshotStorage.createSnapshot()` and `engine.replayRun()` exist in `engine/src/engine.ts` (lines ~958–1087) and `engine/src/run-snapshot.ts`, but nothing in the run lifecycle calls `createSnapshot`. The existing `rerun` path (`POST /api/v1/runs/:runId/rerun`, `runs-rerun.ts`) ignores snapshots entirely — it clones the spec and creates a brand-new run from step 1.

2. **`replayRun()` is correct but unreachable.** The method already handles `fromStepId`: marks preceding steps `success`, resets target and following steps to `queued`, and re-schedules. The worker's step loop already skips steps with `status === 'success'`. The plumbing is sound — it just has no entry point.

3. **No HTTP route or CLI command exposes step-level restart.** The contract type `WorkflowRerunRequest` has no `fromStepId` field; the HTTP client has no `restartRun()` method; there is no `runs-restart` command.

---

## Implementation Steps

### 1. Save snapshot automatically on run finish

**File:** `plugins/workflow/engine/src/engine.ts`

In the `finalizeRun()` (or equivalent run-completion block, ~lines 473–546), after setting `run.status` to `'success'` or `'failed'` and before emitting the finish event, call `createSnapshot`:

```typescript
// Collect step outputs from all jobs
const stepOutputs: Record<string, Record<string, unknown>> = {}
for (const job of run.jobs) {
  for (const step of job.steps) {
    if (step.outputs && Object.keys(step.outputs).length > 0) {
      stepOutputs[step.id] = step.outputs
    }
  }
}
await this.snapshotStorage.createSnapshot(run.id, stepOutputs, run.env ?? {})
```

This makes every completed or failed run replayable for 7 days (existing TTL).

---

### 2. Add `WorkflowRestartRequest` / `WorkflowRestartResponse` contract types

**File:** `plugins/workflow/contracts/src/schemas.ts`

Add alongside the existing `WorkflowRerunRequest`:

```typescript
export const WorkflowRestartRequestSchema = z.object({
  fromStepId: z.string().optional(),
  env: z.record(z.string()).optional(),
})
export type WorkflowRestartRequest = z.infer<typeof WorkflowRestartRequestSchema>

export const WorkflowRestartResponseSchema = z.object({
  runId: z.string(),
  status: RunStatusSchema,
  fromStepId: z.string().optional(),
})
export type WorkflowRestartResponse = z.infer<typeof WorkflowRestartResponseSchema>
```

Export both from `contracts/src/index.ts`.

---

### 3. Add `restartRun()` to `WorkflowHostService`

**File:** `plugins/workflow/daemon/src/host/workflow-host-service.ts`

Add method next to `rerunWorkflow()`:

```typescript
async restartRun(
  runId: string,
  options: WorkflowRestartRequest,
): Promise<WorkflowRestartResponse> {
  const run = await this.engine.replayRun(runId, {
    fromStepId: options.fromStepId,
    env: options.env,
  })
  if (!run) throw new Error('Run not found or snapshot not available')
  return { runId: run.id, status: run.status, fromStepId: options.fromStepId }
}
```

---

### 4. Add REST route `POST /api/v1/runs/:runId/restart`

**File:** `plugins/workflow/daemon/src/api/workflows-api.ts`

Add after the existing `/rerun` route (~line 188):

```typescript
server.post<{ Params: { runId: string }; Body: WorkflowRestartRequest }>(
  '/api/v1/runs/:runId/restart',
  { schema: { tags: ['Runs'], summary: 'Restart a run from a specific step' } },
  async (request, reply) => {
    try {
      const response = await hostService.restartRun(request.params.runId, request.body ?? {})
      return ok(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart run'
      if (message.includes('not found') || message.includes('snapshot not available')) {
        return fail(reply, 404, message)
      }
      return fail(reply, 500, message)
    }
  },
)
```

---

### 5. Add `restartRun()` to the HTTP client

**File:** `plugins/workflow/entry/src/http-client.ts`

Add alongside `rerunWorkflow()`:

```typescript
async restartRun(
  runId: string,
  options: WorkflowRestartRequest = {},
): Promise<WorkflowRestartResponse> {
  return this.post(`/api/v1/runs/${runId}/restart`, options)
}
```

---

### 6. Create `runs-restart` CLI command

**File:** `plugins/workflow/entry/src/commands/runs-restart.ts` (new file)

```typescript
import type { CLIInput } from '@kb-labs/sdk'
import type { WorkflowRestartRequest } from '@kb-labs/workflow-contracts'

const flagsDef = {
  'from-step': { type: 'string' as const, description: 'Step ID to restart from' },
  json: { type: 'boolean' as const, default: false },
} as const

export const runsRestartCommand = {
  name: 'runs-restart',
  description: 'Restart a run from a specific step (inherits outputs of all preceding steps)',
  args: [{ name: 'runId', required: true }],
  flags: flagsDef,

  async execute(input: CLIInput<typeof flagsDef>, { client, ui }) {
    const runId = input.args[0]
    const fromStepId = input.flags['from-step']

    ui.info(`Restarting run ${runId}${fromStepId ? ` from step "${fromStepId}"` : ''}...`)

    const body: WorkflowRestartRequest = { fromStepId }
    const result = await client.restartRun(runId, body)

    if (input.flags.json) {
      ui.json(result)
      return
    }

    ui.success(`Run restarted — new execution ID: ${result.runId}`)
    if (result.fromStepId) {
      ui.info(`Resuming from step: ${result.fromStepId}`)
    }
  },
}
```

Register the command in `plugins/workflow/entry/src/index.ts` alongside the other `runs-*` commands.

---

### 7. Expose `replayRun` on the engine's public interface

**File:** `plugins/workflow/engine/src/index.ts` (or wherever `IWorkflowEngine` is declared)

Ensure `replayRun(runId, options)` is part of the exported interface so `WorkflowHostService` can call it without casting.

---

## Tests / Verification

### Handler unit test (required by bug-fix rule)

**File:** `plugins/workflow/entry/src/__tests__/cli/runs-restart.test.ts` (new)

Verify:
- `runs-restart <runId> --from-step checkout` calls `client.restartRun(runId, { fromStepId: 'checkout' })` exactly once
- Output includes the returned `runId`
- `runs-restart <runId>` (no `--from-step`) calls `client.restartRun(runId, {})` — full restart via snapshot

Use `mockCLIInput<typeof flagsDef>()` and `createMockContext()` from `@kb-labs/shared-testing-e2e`.

### Integration check (manual, with daemon running)

```bash
# 1. Run a 13-step workflow that will fail at step 5
kb workflow run ./github-issue-to-pr.yaml

# 2. Note the runId and failing stepId from runs-view
kb workflow runs-view <runId>

# 3. Fix whatever caused the failure, then restart from step 5
kb workflow runs-restart <runId> --from-step <stepId>

# 4. Confirm new run shows steps 1–4 as 'success' (inherited) and step 5 starts executing
kb workflow runs-watch <newRunId>
```

### Snapshot auto-save regression check

```bash
# After a run completes (success or failure), verify snapshot exists in Redis
redis-cli get "workflow:snapshot:<runId>"
# Should return non-null JSON with stepOutputs populated
```
