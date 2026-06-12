Now I have a complete picture. The implementation is actually already done (commit `758b1e60`), with all tests passing. The only uncommitted change is in `flags.ts` — a description fix and type correction. Let me write the plan document.

---

## Summary

Wire the existing `--failed-only` CLI flag all the way through to the daemon rerun handler: the daemon's `rerunWorkflow` must accept a `failedOnly` boolean and, when true, filter the job spec to only the jobs whose last execution status is `failed` or `interrupted`.

## Root cause / context

The flag `--failed-only` was defined in `runsRerunFlags` but its description read *"not yet supported by daemon"* and the `RunsRerunFlags` type was derived as `typeof runsRerunFlags` (a const-object type, not a proper interface), which made the flag inaccessible via `flags['failed-only']` in the command handler. Downstream, the daemon's `rerunWorkflow` method didn't inspect `request.failedOnly` at all — it passed the full workflow spec to the engine regardless.

## Implementation steps

1. **`plugins/workflow/entry/src/flags.ts`**
   - Change the `'failed-only'` description from `'Rerun only failed jobs (not yet supported by daemon)'` → `'Rerun only jobs that failed or were interrupted'`.
   - Replace `export type RunsRerunFlags = typeof runsRerunFlags` with an explicit interface:
     ```ts
     export interface RunsRerunFlags {
       'run-id'?: string;
       json?: boolean;
       'failed-only'?: boolean;
       'dry-run'?: boolean;
     }
     ```
     This makes `flags['failed-only']` typed as `boolean | undefined` instead of a narrow const literal, which fixes the implicit ignore.

2. **`plugins/workflow/contracts/src/rest-api.ts`** *(already correct — verify only)*
   - Confirm `WorkflowRerunRequest` has `failedOnly?: boolean` and `WorkflowRerunRequestSchema` includes `failedOnly: z.boolean().optional()`.

3. **`plugins/workflow/entry/src/commands/runs-rerun.ts`** *(already correct — verify only)*
   - Confirm the handler reads `flags?.['failed-only'] ?? false` and passes `{ failedOnly }` to `client.rerunWorkflow(runId, { failedOnly })`.
   - Confirm `--dry-run` path does not call the daemon.

4. **`plugins/workflow/daemon/src/host/workflow-host-service.ts`** — add filtering logic to `rerunWorkflow`:
   ```ts
   if (request.failedOnly) {
     const failedJobNames = new Set(
       (sourceRun.jobs ?? [])
         .filter((job: JobRun) => job.status === 'failed' || job.status === 'interrupted')
         .map((job: JobRun) => job.jobName),
     );
     if (failedJobNames.size === 0) throw new Error('No failed jobs to rerun');

     const filteredJobs: Record<string, unknown> = {};
     for (const [name, jobSpec] of Object.entries(spec.jobs)) {
       if (failedJobNames.has(name)) {
         const js = jobSpec as Record<string, unknown>;
         const needs = Array.isArray(js['needs'])
           ? (js['needs'] as string[]).filter((dep) => failedJobNames.has(dep))
           : undefined;
         filteredJobs[name] = needs !== undefined && needs.length < (js['needs'] as string[]).length
           ? { ...js, needs }
           : js;
       }
     }
     spec = { ...spec, jobs: filteredJobs } as WorkflowSpec;
   }
   ```
   The `needs` pruning is important: if job B depends on A and only B failed, rerunning B without A means the `needs` guard must be stripped so the engine doesn't wait for A to re-run.

5. **`plugins/workflow/daemon/src/api/workflows-api.ts`** *(already correct — verify only)*
   - Confirm the `POST /api/v1/runs/:runId/rerun` handler passes `request.body ?? {}` to `hostService.rerunWorkflow` and maps `'No failed jobs to rerun'` → HTTP 400.

## Tests / verification

**Handler (CLI) tests** — `plugins/workflow/entry/src/__tests__/cli/runs-rerun.cli.test.ts`:
- `RRR-07`: `--failed-only` passes `{ failedOnly: true }` to `rerunWorkflow` — verifies the flag is not silently dropped.
- `RRR-08`: without the flag, `rerunWorkflow` is called with `{ failedOnly: false }` — verifies the default.

**Unit tests** — `plugins/workflow/daemon/src/host/workflow-host-service.test.ts`:
- `RW-A`: `failedOnly=false` passes full spec to engine, all jobs rerun.
- `RW-B`: `failedOnly=true` filters to only failed jobs; satisfied `needs` are stripped.
- `RW-C`: `failedOnly=true` with no failed jobs throws `'No failed jobs to rerun'`.
- `RW-D`: unknown `runId` throws `'Run not found'`.

**Run:**
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
pnpm --filter @kb-labs/workflow-daemon run test
```

Both suites must pass green before the fix is complete.
