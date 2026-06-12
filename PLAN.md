Now I have enough context. Here's the implementation plan:

---

## Summary

Enhance `workflow:runs-view` to (1) display full step output values (not just key names) and (2) show per-step stdout/stderr inline in the run tree via a new `--output` flag, using the existing log store that already captures stdout keyed by `stepId`.

## Root cause / context

`renderRun()` in `plugins/workflow/entry/src/commands/runs-view.ts:103–104` only emits output **key names** (`Outputs: key1, key2`) — values are never shown. Stdout is only accessible via the separate `--log` flag which dumps a flat chronological log list with no step grouping. After a run completes, per-step stdout is available in the platform log store (SQLite ring buffer) keyed by `runId` + `stepId`, queryable via `client.getRunLogs(runId, { stepId })`. The data exists; it is just not surfaced in the default or any structured view.

## Implementation steps

### 1. Fix step output value display in `renderRun()`

**File**: `plugins/workflow/entry/src/commands/runs-view.ts`

- Replace lines 103–104:
  ```ts
  // before
  jobItems.push(`   Outputs: ${Object.keys(step.outputs).join(', ')}`);
  
  // after — show key: value pairs, truncated at 120 chars per value
  for (const [k, v] of Object.entries(step.outputs)) {
    const raw = typeof v === 'string' ? v : JSON.stringify(v);
    const display = raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
    jobItems.push(`   ${k}: ${display}`);
  }
  ```
- Keep gate-step special-casing (lines 80–88) unchanged.

### 2. Add `--output` flag type to `RunsViewFlags`

**File**: `plugins/workflow/entry/src/commands/runs-view.ts`

- Add `output?: boolean` to `RunsViewFlags` interface.
- Read it in `handler.execute`: `const showOutput = flags?.output ?? false;`

### 3. Extend `renderRun()` to accept optional per-step log lines

**File**: `plugins/workflow/entry/src/commands/runs-view.ts`

- Change signature:
  ```ts
  function renderRun(
    run: WorkflowRunDetail,
    stepLogs?: Record<string, Array<{ message: string; level: string; stream?: string }>>,
  ): RunSection[]
  ```
- Inside the step loop, after showing outputs and errors, insert:
  ```ts
  const logs = stepLogs?.[step.id];
  if (logs?.length) {
    const MAX_LINES = 20;
    const shown = logs.slice(-MAX_LINES);
    for (const l of shown) {
      const stream = l.stream === 'stderr' ? 'ERR' : 'OUT';
      jobItems.push(`   [${stream}] ${l.message}`);
    }
    if (logs.length > MAX_LINES) {
      jobItems.push(`   … ${logs.length - MAX_LINES} earlier lines (use --log --step=<id>)`);
    }
  }
  ```

### 4. Fetch logs grouped by step when `--output` is set

**File**: `plugins/workflow/entry/src/commands/runs-view.ts`, inside `handler.execute` before the default `renderRun` call:

```ts
let stepLogs: Record<string, Array<{ message: string; level: string; stream?: string }>> | undefined;

if (showOutput) {
  const allLogs = await client.getRunLogs(runId);
  stepLogs = {};
  for (const l of allLogs) {
    const sid = String(l['stepId'] ?? l['context']?.['stepId'] ?? '');
    if (!sid) { continue; }
    (stepLogs[sid] ??= []).push({
      message: String(l['message'] ?? ''),
      level: String(l['level'] ?? 'info'),
      stream: l['stream'] as string | undefined ?? l['context']?.['logSource'] as string | undefined,
    });
  }
}

const sections = renderRun(run, stepLogs);
```

### 5. Verify log entries expose `stepId` and `stream`/`logSource`

**File**: `plugins/workflow/daemon/src/job-broker.ts:194–207`

Check the `map()` at the bottom of `_queryLogs`. Currently it returns `{ timestamp, level, message, context }`. Confirm `context` contains `stepId` and `logSource`. If `stepId` is only inside `context`, update the http-client `getRunLogs` return type in `plugins/workflow/entry/src/http-client.ts` to reflect `context?: { stepId?: string; logSource?: string; [k: string]: unknown }` (or add a top-level `stepId` to the return mapping in `job-broker.ts`).

If `stepId` is buried in `context.fields`, promote it to a top-level field in the `map()`:
```ts
return page.map((log) => ({
  timestamp: new Date(log.timestamp).toISOString(),
  level: log.level,
  message: log.message,
  stepId: log.fields['stepId'] as string | undefined,   // ← add
  stream: log.fields['logSource'] as string | undefined, // ← add
  context: log.fields,
}));
```

Update the `getRunLogs` return type in `plugins/workflow/entry/src/http-client.ts:349` to add `stepId?: string; stream?: string`.

### 6. Register the new `--output` flag in the command manifest

**File**: `plugins/workflow/entry/src/commands/runs-view.ts` — inside `defineCommand` add to `flags` (if the command uses a declarative `flags` block):
```ts
output: { type: 'boolean', description: 'Show per-step stdout/stderr inline' },
```
Check how other flags like `--log` are declared in the manifest section (look for a `flags:` key in `defineCommand`). Follow the same pattern.

## Tests / verification

### Handler test (new, per bug-fix rule)

**File**: `plugins/workflow/entry/src/__tests__/cli/runs-view.test.ts` (create or add to existing)

1. **Output values test**: mock `client.getRun()` with a run containing a step with `outputs: { score: 42, label: 'ok' }`. Assert rendered output contains `score: 42` and `label: ok`, not just `score, label`.

2. **`--output` flag test**: mock `client.getRun()` and `client.getRunLogs()` returning two log entries with `stepId: 'step-1'` and `stream: 'stdout'`. Call handler with `flags: { output: true }`. Assert rendered output contains `[OUT] <message>` indented under step-1.

3. **`--output` truncation test**: mock 25 log entries for the same step. Assert output contains `… 5 earlier lines` truncation hint.

### Manual verification

```bash
# start services
kb-dev start

# run a workflow that has steps with outputs (e.g. a script step)
pnpm kb workflow run <workflow-name>

# check outputs are now shown with values
pnpm kb workflow runs view <run-id>

# check stdout is shown inline per step
pnpm kb workflow runs view <run-id> --output

# existing --log flag must still work unchanged
pnpm kb workflow runs view <run-id> --log

# JSON output should be unaffected
pnpm kb workflow runs view <run-id> --json
```

```bash
# run handler tests
pnpm --filter @kb-labs/workflow-entry run test:cli
```
