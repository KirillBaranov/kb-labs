## Summary

`engine.replayRun()` with `fromStepId` support is fully implemented internally but never exposed: no REST endpoint, no CLI command, and no snapshot is created when a run fails. This issue is purely about wiring the existing machinery to a user-facing surface.

## Root cause / context

Three gaps prevent the feature from working end-to-end:

1. **No snapshot on failure.** `RunSnapshotStorage.createSnapshot()` exists but is never called automatically when a run fails. Without a snapshot there is nothing to replay from.
2. **No REST endpoint.** `engine.replayRun()` is never reachable over HTTP — `POST /api/v1/runs/:runId/rerun` creates a fresh run, it does not call `replayRun`.
3. **No CLI command.** `workflow:runs-rerun` creates a new run; there is no `runs-replay` command that accepts `--from-step`.

The existing `replayRun(runId, { fromStepId, stepOutputs, env })` implementation already handles all the hard parts: it loads the snapshot, marks preceding steps as `success`, resets the target step and downstream steps to `queued`, merges env overrides, and re-schedules the jobs.

## Implementation steps

### 1 — Auto-create a snapshot when a run completes or fails

**File:** `plugins/workflow/engine/src/engine.ts`

In `markRunCompleted()` and `markRunFailed()` (wherever the run status is set to `success` or `failed`), call `this.createSnapshot()` immediately after persisting the final run state.

```ts
// after engine.updateRun sets status = 'failed' / 'success'
await this.createSnapshot(updatedRun)
```

`createSnapshot` already collects `stepOutputs` from the run's nested step objects — no additional plumbing needed.

---

### 2 — Add a REST endpoint for replay

**File:** `plugins/workflow/daemon/src/api/workflows-api.ts`

Add a new route alongside the existing `/rerun`:

```
POST /api/v1/runs/:runId/replay
Body: { fromStepId?: string; env?: Record<string, string> }
```

Handler body:

```ts
const { fromStepId, env } = req.body
const run = await engine.replayRun(runId, { fromStepId, env })
if (!run) return res.status(404).json({ error: 'Snapshot not found for this run' })
res.json(run)
```

---

### 3 — Expose replay in the REST API contract

**File:** `plugins/workflow/contracts/src/api.ts` (or wherever API types live)

Add `ReplayRunBody` and `ReplayRunResponse` Zod schemas so the gateway can validate the request and the SDK can type-check callers.

---

### 4 — Add a `runs-replay` CLI command

**File (new):** `plugins/workflow/entry/src/commands/runs-replay.ts`

Mirror the structure of `runs-rerun.ts`. Flags:

| Flag | Description |
|---|---|
| `--run <id>` | Run ID to replay (required) |
| `--from-step <id>` | Step ID to restart from (optional; omit = restart from beginning using snapshot) |
| `--env <K=V>` | Override env vars (repeatable) |

Implementation: call the new REST endpoint via the existing HTTP client, then stream/print the new run's event log (reuse `runs-watch` logic).

**File:** `plugins/workflow/entry/src/index.ts`

Register the new command in the plugin manifest.

---

### 5 — Wire snapshot deletion on run expiry

**File:** `plugins/workflow/engine/src/engine.ts`

In `cleanupStaleRuns()` (the startup cleanup path), call `this.deleteSnapshot(runId)` when a run is abandoned so stale snapshots don't accumulate beyond the existing 7-day TTL.

---

### 6 — Surface step IDs in the run detail output

**File:** `plugins/workflow/entry/src/commands/runs-get.ts` (or equivalent)

Make sure `kb workflow runs get <id>` prints each step's `spec.id` (not just its name/index) so users know which ID to pass to `--from-step`.

---

### 7 — Guard: snapshot existence check before replay

**File:** `plugins/workflow/engine/src/engine.ts` — already returns `null` when no snapshot exists. The REST handler (step 2) converts that to a clear `404`. No additional change needed.

## Tests / verification

### Unit — snapshot created on failure

**File (new):** `plugins/workflow/engine/src/__tests__/snapshot-on-failure.test.ts`

- Stub `StateStore` and `RunSnapshotStorage`
- Trigger `engine.markRunFailed()`
- Assert `RunSnapshotStorage.createSnapshot` was called with the correct `runId` and step outputs

### Unit — `replayRun` step state transitions (already testable, add assertions)

**File:** `plugins/workflow/engine/src/__tests__/engine.replay.test.ts` (create if absent)

- Create a fake run with 5 steps, all `success` except step 3 (`failed`)
- Call `engine.replayRun(runId, { fromStepId: 'step-3' })`
- Assert steps 1–2 remain `success`, step 3 is `queued`, steps 4–5 are `queued`

### Handler test — REST endpoint

**File (new):** `plugins/workflow/entry/src/__tests__/cli/runs-replay.test.ts`

- Mock HTTP client to return a replayed run
- Call `mockCLIInput<RunsReplayFlags>({ run: 'run-abc', fromStep: 'step-3' })`
- Assert HTTP client received `POST /api/v1/runs/run-abc/replay` with `{ fromStepId: 'step-3' }`

### Manual / journey

```bash
# 1. Start a long pipeline that fails at step 3
kb workflow runs trigger github-issue-to-pr --input issue=999

# 2. Note the run ID and the failing step ID from the output
kb workflow runs get <runId>        # verify step IDs are visible

# 3. Replay from the failed step
kb workflow runs replay --run <runId> --from-step <stepId>

# 4. Verify the new run shows steps 1-2 as inherited (no re-execution events)
# and step 3 onwards produce fresh execution events
kb workflow runs watch <newRunId>
```
