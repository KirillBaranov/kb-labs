Теперь у меня достаточно данных для детального плана.

---

## Summary

Add a `WorkflowFileWatcher` to the workflow daemon that watches `.kb/workflows/` for YAML changes and invalidates the `ManifestScanner` cache + triggers cron re-discovery on each change, with a 300 ms debounce. Wire it into `bootstrap.ts` with clean shutdown.

---

## Root cause / context

`WorkflowRepository` reads directly from disk on every `get()` / `list()` call (no in-memory map), so standalone-workflow YAML changes are picked up for new on-demand runs. The real stale-cache surface is two-fold:

1. **`ManifestScanner`** (inside `WorkflowService`) caches plugin-manifest-declared workflows in the platform cache with a 60 s TTL (`manifestCacheTtlMs`). A YAML edit does not reset that TTL — `refreshManifests()` must be called explicitly.
2. **`CronDiscovery`** runs once at daemon startup (`discoverAll()`). Editing a cron schedule in `.kb/jobs/*.yml` or `.kb/workflows/*.yaml` is never re-processed unless the daemon restarts.
3. The already-existing `POST /api/v1/workflows/refresh` (in `workflows-api.ts:41`) is the correct manual escape hatch, but it has no automatic trigger — users don't know it exists and must restart the daemon instead.

---

## Implementation steps

### 1. Create `plugins/workflow/daemon/src/file-watcher.ts`

New class `WorkflowFileWatcher`:

```ts
import { watch, FSWatcher } from 'node:fs';
import { ILogger } from '@kb-labs/core-platform';
import { WorkflowService } from '@kb-labs/workflow-engine';
import { CronDiscovery } from './cron-discovery.js';

interface WorkflowFileWatcherOptions {
  watchDirs: string[];          // absolute paths: ['.kb/workflows', '.kb/jobs']
  workflowService: WorkflowService;
  cronDiscovery: CronDiscovery;
  logger: ILogger;
  debounceMs?: number;          // default 300
}
```

- Constructor opens an `fs.watch` watcher (recursive: false; one watcher per dir) for each path in `watchDirs`.
- On each `change` / `rename` event whose filename ends with `.yml` or `.yaml`:
  - Clear any pending debounce timer.
  - After `debounceMs` ms: call `this.workflowService.refreshManifests()` then `this.cronDiscovery.discoverAll()`.
  - Log at `info` level: which file changed, how many workflows/cron-jobs re-loaded.
- `close(): void` — clears debounce timer and calls `watcher.close()` for each `FSWatcher`.
- Handle `ENOENT` gracefully: if a watched directory does not exist yet, skip silently and log a `debug` message (directory may be created later — a follow-up re-watch is out of scope).

### 2. Modify `plugins/workflow/daemon/src/bootstrap.ts`

In the `setup()` callback:

a. **Import** `WorkflowFileWatcher` from `./file-watcher.js`.

b. **Resolve watch directories** after `projectRoot` is known:
```ts
import { join } from 'node:path';
const workflowsDir = join(projectRoot, '.kb', 'workflows');
const jobsDir      = join(projectRoot, '.kb', 'jobs');
```

c. **Instantiate** after `workflowService` and `cronDiscovery` are created (currently lines ~138–147):
```ts
const fileWatcher = new WorkflowFileWatcher({
  watchDirs: [workflowsDir, jobsDir],
  workflowService,
  cronDiscovery,
  logger: bootstrapLogger,
  debounceMs: 300,
});
```

d. **Shut down** inside the existing `return async () => { … }` cleanup callback (line 182+):
```ts
fileWatcher.close();
```

### 3. Modify `plugins/workflow/daemon/src/cron-discovery.ts`

`discoverAll()` is currently fire-and-forget safe, but verify it is idempotent (re-calling it should replace, not duplicate, registered cron jobs). If `CronScheduler.registerUserJob` / `registerPluginJob` are additive:

- Add a `CronScheduler.clearUserJobs()` method (or a `reload()` wrapper) that deregisters existing user-defined jobs before re-registering.  
- `discoverAll()` should call `clearUserJobs()` before re-registering, so repeated calls don't double-schedule.

Check `CronScheduler` in `plugins/workflow/daemon/src/cron-scheduler.ts` — if it already tracks registered job IDs and prevents duplicates, no change needed here. Document the finding either way.

### 4. (Optional) Rename / alias `POST /api/v1/workflows/refresh` → also accept `POST /api/v1/workflows/reload`

The existing endpoint already does the right thing. Add an alias route in `plugins/workflow/daemon/src/api/workflows-api.ts`:

```ts
server.post('/api/v1/workflows/reload', { schema: { ... } }, handler);  // alias
```

This matches the endpoint name proposed in the issue without breaking existing callers.

---

## Tests / verification

### Handler test (unit, no daemon)

File: `plugins/workflow/daemon/src/__tests__/cli/file-watcher.test.ts`

- Mock `fs.watch` to emit a synthetic `change` event for `my-workflow.yaml`.
- Assert `workflowService.refreshManifests()` is called exactly once after debounce.
- Assert it is NOT called for a non-YAML file change (e.g. `README.md`).
- Assert double-rapid events trigger only one `refreshManifests()` call (debounce coalescence).
- Assert `close()` stops the watcher and clears pending timers.

Run with:
```bash
pnpm --filter @kb-labs/workflow-daemon run test:cli
```

### Manual / integration verification

```bash
# 1. Start daemon
kb-dev start

# 2. Trigger the workflow to confirm baseline
pnpm kb workflow run my-workflow

# 3. Edit .kb/workflows/my-workflow.yaml (change a step name or env var)

# 4. Within ~1 second re-trigger — should execute the NEW definition without restarting
pnpm kb workflow run my-workflow

# 5. Check daemon logs for the reload message:
#    [workflow] WorkflowFileWatcher: my-workflow.yaml changed, refreshed N workflows, M cron jobs
```

### Regression: existing behavior unchanged

- Confirm `POST /api/v1/workflows/refresh` still works as before.
- Confirm daemon starts cleanly when `.kb/workflows/` does not yet exist (ENOENT path).
- Confirm no duplicate cron job scheduling after multiple rapid file saves.
