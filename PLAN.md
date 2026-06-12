Now I have enough context. Let me write the implementation plan.

---

## Summary

Add first-class display of step outputs (structured key-value results) and step stdout/stderr to `kb workflow runs view` for completed runs: surface `run.result.outputs` in the summary, honour the `--step` filter when combined with `--output`, remove the 20-line inline cap when a single step is targeted, and fix step-name resolution in log lines.

---

## Root cause / context

`runs view` already retrieves step-level `outputs` from the run detail and prints them, and has an `--output` flag that loads all run logs and groups them by `step.id`. However three gaps remain after a run completes:

1. **`run.result.outputs` is never shown** — the workflow-level final outputs stored in `WorkflowRun.result.outputs` (`ExecutionResultSchema`) are returned by `GET /api/v1/runs/:runId` but `renderRun()` never reads `run.result`.
2. **`--step` is ignored in `--output` mode** — when the user passes both `--output` and `--step <name>`, `stepFilter` is used only for the `--log` code path (lines 202-203 in `runs-view.ts`); the `--output` block fetches all logs and renders all steps regardless.
3. **20-line hard cap hides the full stdout** — the inline `[OUT]/[ERR]` display is capped at 20 lines per step unconditionally, making it insufficient for debugging; when `--step` targets a single step the cap should be lifted (or made much larger).
4. **`stepName` is never resolved** — `getRunLogs` returns `stepId` from log metadata but `stepName` is always undefined in practice (job-broker only sets `fields['stepId']`, not `fields['stepName']`), so the log formatter falls back to raw IDs.

---

## Implementation steps

### 1. `plugins/workflow/daemon/src/job-broker.ts` — emit `stepName` in log metadata

Locate the loop that emits logs (around line 195). Add `stepName` extraction by building a `stepId → name` lookup from the run snapshot before returning logs.

```
async getRunLogs(runId, options):
  1. fetch run snapshot from engine (already done for time-window calc)
  2. build Map<stepId, stepName> from run.jobs[*].steps[*]
  3. in the mapped result, set  stepName: stepNameMap.get(entry.stepId)
```

File: `plugins/workflow/daemon/src/job-broker.ts`
- Read the existing `_queryLogs` private method (~line 123).
- In the final `.map()` that constructs each log entry, look up the step name from the run's job/step tree.

### 2. `plugins/workflow/entry/src/http-client.ts` — no interface changes needed

`getRunLogs` return type already has `stepName?: string` — the field will be populated after step 1. No changes required here.

### 3. `plugins/workflow/entry/src/commands/runs-view.ts` — three targeted fixes

**3a. Show `run.result.outputs` in the summary section** (`renderRun`, ~line 50)

After the `Inputs:` line in the summary block, add:

```typescript
if (run.result?.outputs && Object.keys(run.result.outputs).length > 0) {
  summary.push(`Outputs:  ${JSON.stringify(run.result.outputs)}`);
}
if (run.result?.summary) {
  summary.push(`Result:   ${run.result.summary}`);
}
```

**3b. Apply `--step` filter when building `stepLogs` in `--output` mode** (~line 276)

The existing `--output` block ignores `stepFilter`. Change it:

```typescript
if (showOutput) {
  const allLogs = await client.getRunLogs(runId, stepFilter ? { stepId: stepFilter } : {});
  stepLogs = {};
  for (const l of allLogs) {
    const sid = l.stepId ?? ...;
    if (!sid) continue;
    (stepLogs[sid] ??= []).push({ ... });
  }
}
```

**3c. Lift the 20-line cap when a single step is targeted** (`renderRun`, ~line 121)

```typescript
const MAX_LINES = stepLogs && Object.keys(stepLogs).length === 1 ? Infinity : 20;
```

Pass `stepLogs` keys count down through `renderRun` — simplest approach: add a second parameter `opts?: { maxStdoutLines?: number }` to `renderRun` and pass `maxStdoutLines: stepFilter ? undefined : 20` from the caller.

**3d. Use `stepName` in log display when available**

In the `--log` / `--log-failed` formatter (~line 260), the existing code already reads `l['stepName']`. After step 1, this will be populated automatically.

### 4. Tests — `plugins/workflow/entry/src/__tests__/cli/runs-view.cli.test.ts`

Add three test cases (all handler-level, mock HTTP client):

**Test A — `run.result.outputs` shown in summary**
- Mock `getRun` to return a run with `result: { outputs: { report: 'ok' }, summary: 'done' }`
- Assert `sideBox` sections contain `Outputs:  {"report":"ok"}` and `Result:   done`

**Test B — `--output --step <id>` only shows stdout for the targeted step**
- Mock `getRunLogs` to verify it is called with `{ stepId: '<id>' }`
- Assert only the targeted step's `[OUT]` lines appear

**Test C — stdout cap lifted when `--step` is specified**
- Mock logs returning 30 entries for a single step
- Assert all 30 appear (no "N earlier lines" truncation hint)

---

## Tests / verification

```bash
# Run handler tests (no daemon required)
pnpm --filter @kb-labs/workflow-entry run test:cli

# Manual smoke test against a live run (needs kb-dev start):
kb workflow runs view <runId>                  # should show Outputs: / Result: in summary
kb workflow runs view <runId> --output         # all steps with stdout
kb workflow runs view <runId> --output --step <stepId>   # only that step, no 20-line cap
kb workflow runs view <runId> --log-failed     # step names instead of IDs
```

Each test case listed in step 4 must **fail before** the corresponding fix and **pass after** per the project's bug-fix rule.
