Now I have everything needed to write the plan.

---

## Summary

Add a dedicated `POST /api/v1/runs/:runId/rerun` daemon endpoint that accepts `{ failedOnly?: boolean }`, implement the filtering logic in the host service, update the HTTP client, and wire the CLI command to use it instead of the current two-step workaround that ignores the flag.

## Root cause / context

The CLI command `runs-rerun` currently implements the rerun as a two-step workaround: `getRun(runId)` to extract the workflow ID and inputs, then `runWorkflow(workflowId, { inputs })`. The `--failed-only` flag is parsed and shown in the dry-run intent but is never forwarded to the daemon — there is an explicit "not yet supported" info message and the flag is dropped. No dedicated rerun endpoint exists in the daemon, and `WorkflowRunRequest` has no `failedOnly` field. The engine supports `runFromSpec(spec, input)` which accepts a `WorkflowSpec`; filtering jobs is done by modifying the spec's `jobs` record before passing it to the engine.

## Implementation steps

### 1. `plugins/workflow/contracts/src/rest-api.ts`

Add a new request interface and Zod schema after `WorkflowRunRequestSchema`:

```ts
export interface WorkflowRerunRequest {
  failedOnly?: boolean;
}

export const WorkflowRerunRequestSchema = z.object({
  failedOnly: z.boolean().optional(),
});
```

### 2. `plugins/workflow/daemon/src/host/workflow-host-service.ts`

Add a `rerunWorkflow(runId: string, request: WorkflowRerunRequest): Promise<{ runId: string; status: string }>` method after `runWorkflow`:

- Call `engine.getRun(runId)` — throw `'Run not found'` if null.
- Extract `workflowId` from `run.metadata?.workflowId ?? run.name`.
- Load the workflow via `workflowService.get(workflowId)` — throw `'Workflow not found'` if null.
- Build `spec` from `workflow.input` as before in `runWorkflow`.
- If `request.failedOnly === true`:
  - Collect failed job names: `run.jobs` entries where `job.status === 'failed' || job.status === 'interrupted'`.
  - If no failed jobs exist, throw `'No failed jobs to rerun'` (400 at API layer).
  - Filter `spec.jobs` to only those keys; for each included job, strip from its `needs` array any job name not present in the filtered set (avoids dangling dependency references).
- Call `engine.runFromSpec(filteredSpec, { trigger: { type: 'manual', actor: 'cli-rerun', payload: run.inputs ?? {} }, inputs: run.inputs ?? {} })`.
- Return `{ runId: newRun.id, status: newRun.status }`.

Add `WorkflowRerunRequest` to the imports from `@kb-labs/workflow-contracts`.

### 3. `plugins/workflow/daemon/src/api/workflows-api.ts`

Add a new route after the cancel endpoint:

```ts
// POST /api/v1/runs/:runId/rerun — Rerun a workflow run, optionally only failed jobs
server.post<{ Params: { runId: string }; Body: WorkflowRerunRequest }>(
  '/api/v1/runs/:runId/rerun',
  { schema: { tags: ['Runs'], summary: 'Rerun a workflow run' } },
  async (request, reply) => {
    try {
      const { runId } = request.params;
      const response = await observability.observeOperation(
        'workflow.run.rerun',
        () => hostService.rerunWorkflow(runId, request.body ?? {}),
      );
      return ok(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rerun workflow';
      if (message === 'Run not found' || message === 'Workflow not found') return fail(reply, 404, message);
      if (message === 'No failed jobs to rerun') return fail(reply, 400, message);
      logger.error('[workflows-api] Error rerunning workflow', error instanceof Error ? error : undefined);
      return fail(reply, 500, message);
    }
  },
);
```

Add `WorkflowRerunRequest` to imports from `@kb-labs/workflow-contracts`.

### 4. `plugins/workflow/entry/src/http-client.ts`

Add a `rerunWorkflow(runId: string, request?: WorkflowRerunRequest): Promise<{ runId: string; status: string }>` method that `POST`s to `/api/v1/runs/${encodeURIComponent(runId)}/rerun` with `JSON.stringify(request ?? {})`. Follow the same error-unwrap pattern as `runWorkflow`.

Add `WorkflowRerunRequest` to the contract imports.

### 5. `plugins/workflow/entry/src/commands/runs-rerun.ts`

- Remove the `client.getRun()` prefetch and the `workflowId` extraction logic.
- Replace the two-step call with `client.rerunWorkflow(runId, { failedOnly })`.
- Remove the `"Note: --failed-only is not yet supported"` info message.
- Keep the success output block, substituting `workflowId` references with the run ID (since we no longer have the workflowId at CLI level — or keep a simplified message).
- The manifest description note `"(not yet supported by daemon)"` in `plugins/workflow/entry/src/manifest.ts` should also be removed.

### 6. `plugins/workflow/entry/src/__tests__/cli/runs-rerun.cli.test.ts`

Update mock setup: replace `getRun` + `runWorkflow` mocks with a `rerunWorkflow` mock (matching the new client API). Update existing tests RRR-01 through RRR-04 accordingly.

Add two new tests:

- **RRR-07**: `--failed-only` passes `failedOnly: true` to `rerunWorkflow`. Mock `rerunWorkflow` with a spy; assert it is called with `{ failedOnly: true }` and `exitCode` is 0.
- **RRR-08**: without `--failed-only`, `rerunWorkflow` is called with `{ failedOnly: false }` (or `falsy`) and `exitCode` is 0.

### 7. `plugins/workflow/daemon/src/host/__tests__/workflow-host-service.rerun.test.ts` *(new file)*

Unit tests for `WorkflowHostService.rerunWorkflow`:

- **Test A** (`failedOnly=false`): mock `engine.getRun` returning a run with jobs `[{jobName:'build',status:'success'},{jobName:'test',status:'failed'}]`; mock `workflowService.get` returning a spec with both jobs; assert `engine.runFromSpec` is called with the full spec (both jobs present).
- **Test B** (`failedOnly=true`, mixed jobs): same setup; assert `engine.runFromSpec` is called with only the `test` job in `spec.jobs`, and that job's `needs` referencing `build` is stripped.
- **Test C** (`failedOnly=true`, no failed jobs): mock all jobs as `success`; assert the method throws `'No failed jobs to rerun'`.
- **Test D** (`failedOnly=true`, run not found): mock `engine.getRun` returning `null`; assert throws `'Run not found'`.

## Tests / verification

```bash
# Run CLI handler unit tests
pnpm --filter @kb-labs/workflow-entry run test:cli

# Run daemon host service unit tests
pnpm --filter @kb-labs/workflow-daemon run test

# Type-check both packages
pnpm --filter @kb-labs/workflow-entry type-check
pnpm --filter @kb-labs/workflow-daemon type-check
pnpm --filter @kb-labs/workflow-contracts type-check

# Build affected packages
kb-devkit run build --affected
```

For integration verification with a running daemon:
```bash
# Start services
kb-dev start

# Trigger a workflow run and grab the run ID of a partially-failed run, then:
pnpm kb workflow runs rerun <runId> --failed-only
# Verify: new run created, only failed jobs appear in the run's job list
pnpm kb workflow runs view <newRunId>
```
