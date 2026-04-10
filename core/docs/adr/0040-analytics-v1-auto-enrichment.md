# ADR-0040: Analytics V1 Auto-Enrichment

**Date:** 2025-12-31
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-31
**Tags:** [analytics, observability, platform, automation]

## Context

KB Labs analytics system was collecting events in a legacy format:
```json
{
  "type": "event",
  "name": "llm.completion.completed",
  "timestamp": "2025-12-31T10:00:00Z",
  "properties": { ... }
}
```

This format had several critical issues:
1. **Missing source metadata** - No tracking of which product/version generated events
2. **No actor information** - Can't distinguish between user, agent, or CI actions
3. **No correlation IDs** - Can't correlate events from single execution (runId)
4. **Inconsistent structure** - Different adapters wrote different formats
5. **Poor visualization** - Studio analytics UI showed empty Actor columns and incomplete data

The new V1 schema (`kb.v1`) was designed to address these issues but required:
- Auto-detection of source (product name, version)
- Auto-detection of actor (user from git, CI from env vars)
- Auto-generation of runId per execution
- Backward compatibility with 115 existing legacy events

**Alternatives Considered:**
1. **Manual enrichment** - Require every `track()` call to pass metadata (rejected: breaks existing code, error-prone)
2. **Post-processing** - Enrich events when reading (rejected: can't retroactively add missing metadata)
3. **Auto-enrichment at adapter level** (chosen: transparent, centralized, scalable)

## Decision

### V1 Event Schema
```typescript
interface AnalyticsEvent {
  id: string;                    // UUID
  schema: 'kb.v1';               // Version marker
  type: string;                  // Event type (e.g., 'llm.completion.completed')
  ts: string;                    // ISO 8601 timestamp
  ingestTs: string;              // Ingestion timestamp
  source: {
    product: string;             // From package.json name
    version: string;             // From package.json version
  };
  runId: string;                 // UUID per execution
  actor?: {
    type: 'user' | 'agent' | 'ci';
    id?: string;                 // Email or CI username
    name?: string;               // Display name
  };
  ctx?: Record<string, unknown>; // Additional context (workspace, branch, etc.)
  payload?: unknown;             // Event-specific data
}
```

### Auto-Enrichment Context
```typescript
interface AnalyticsContext {
  source: { product: string; version: string };  // Auto-detected from package.json
  runId: string;                                  // Auto-generated UUID per execution
  actor?: { type: 'user' | 'agent' | 'ci'; id?: string; name?: string };  // Auto-detected
  ctx?: Record<string, string | number | boolean | null>;  // Auto-populated (workspace, branch)
}
```

### Auto-Detection Logic
1. **Source Detection** (in `PlatformServices` loader):
   - Read `package.json` from workspace root
   - Extract `name` → `source.product`
   - Extract `version` → `source.version`
   - Fallback: `{ product: 'kb-labs', version: '0.0.0' }`

2. **Actor Detection**:
   - **CI Mode**: If `CI=true`, `GITHUB_ACTIONS=true`, `GITLAB_CI=true`, etc.
     ```typescript
     {
       type: 'ci',
       id: process.env.GITHUB_ACTOR || 'ci-bot',
       name: process.env.GITHUB_ACTOR || 'CI Bot'
     }
     ```
   - **User Mode**: Execute `git config user.name` and `git config user.email`
     ```typescript
     {
       type: 'user',
       id: 'user@example.com',  // From git config user.email
       name: 'John Doe'          // From git config user.name
     }
     ```

3. **RunId Generation**:
   - Generate `randomUUID()` once per PlatformServices initialization
   - Correlates all events in single CLI invocation or REST request

4. **Context Population**:
   - `workspace`: Current working directory
   - `branch`: From `git rev-parse --abbrev-ref HEAD` (if available)

### Implementation

**New Module**: `kb-labs-core/packages/core-runtime/src/analytics-context.ts`
```typescript
export async function createAnalyticsContext(cwd: string): Promise<AnalyticsContext>
```

**Adapter Contract**: Analytics adapters accept optional `context` parameter:
```typescript
export function createAdapter(
  options?: FileAnalyticsOptions,
  context?: AnalyticsContext  // NEW: Optional context
): IAnalytics
```

**Loader Integration**: `core-runtime/src/loader.ts`
```typescript
// Auto-detect context once per initialization
const analyticsContext = await createAnalyticsContext(cwd);

// Pass to analytics adapter
const analyticsAdapter = await loadAnalyticsAdapter(adapterPath, cwd, {
  options: adapterOptions.analytics,
  context: analyticsContext  // Inject auto-detected context
});
```

**FileAnalytics**: Constructor accepts context, enriches all events automatically:
```typescript
class FileAnalytics implements IAnalytics {
  constructor(options = {}, context?: AnalyticsContext) {
    this.context = context ?? defaultContext;
  }

  async track(event: string, payload?: unknown): Promise<void> {
    const v1Event = {
      id: randomUUID(),
      schema: 'kb.v1',
      type: event,
      ts: new Date().toISOString(),
      ingestTs: new Date().toISOString(),
      source: this.context.source,      // Auto-enriched
      runId: this.context.runId,        // Auto-enriched
      actor: this.context.actor,        // Auto-enriched
      ctx: this.context.ctx,            // Auto-enriched
      payload
    };
    await this.writeV1(v1Event);
  }
}
```

### Backward Compatibility

**Reading Legacy Events**: FileAnalytics detects format via `schema` field:
```typescript
if (parsed.schema === 'kb.v1') {
  events.push(parsed);  // V1 format
} else {
  const mapped = mapLegacyToPlatformEvent(parsed);  // Convert legacy → V1
  events.push(mapped);
}
```

**Legacy Mapping**: Best-effort extraction from properties:
```typescript
{
  source: { product: 'file-analytics', version: '0.1.0' },  // Default
  runId: randomUUID(),  // Generate new
  actor: undefined,     // Can't retroactively detect
  ...
}
```

## Consequences

### Positive

1. **Zero API Changes** - Existing `platform.analytics.track()` calls work unchanged
2. **Automatic Metadata** - Source, actor, runId populated without developer intervention
3. **Complete Observability** - Studio UI now shows full context (Actor, Source, RunId)
4. **Scalable** - Context detection happens once per execution, cached
5. **CI/CD Ready** - Automatic detection of CI environments (GitHub Actions, GitLab CI, etc.)
6. **Backward Compatible** - Legacy events converted on read, no data loss
7. **Correlation** - Can trace all events from single CLI invocation via `runId`

### Negative

1. **Git Dependency** - Actor detection requires git installation (gracefully degrades if missing)
2. **Disk I/O** - Reads package.json on every initialization (~1-5ms)
3. **Migration Period** - Old events lack actor/source metadata (cannot be retroactively added)
4. **execSync Risk** - `git config` commands may fail in non-git environments (error handling added)

### Alternatives Considered

**Why not manual enrichment?**
- Would require updating 50+ existing `track()` calls across codebase
- Error-prone: developers might forget to add context
- Not scalable: every new analytics call needs boilerplate

**Why not post-processing?**
- Can't retroactively determine actor for old events
- Requires storing raw events + metadata separately
- Complex pipeline, more failure points

**Why not global singleton context?**
- Tested but chosen instance-based to support multi-tenant future
- AnalyticsContext passed per-adapter allows tenant isolation

## Implementation

### Changes Required

1. ✅ **Core Platform** (`kb-labs-core/packages/core-platform`):
   - Add `AnalyticsContext` interface to `src/adapters/analytics.ts`
   - Export from `src/adapters/index.ts`

2. ✅ **Analytics Adapter** (`kb-labs-adapters/packages/adapters-analytics-file`):
   - Update constructor to accept `context?: AnalyticsContext`
   - Modify `track()`, `metric()`, `identify()` to create V1 events
   - Add `writeV1()` method for V1 format
   - Update `readAllEvents()` to detect and convert legacy format

3. 🔄 **Core Runtime** (`kb-labs-core/packages/core-runtime`):
   - Create `src/analytics-context.ts` module with `createAnalyticsContext()`
   - Update `src/loader.ts` to call `createAnalyticsContext()` before loading analytics
   - Pass context to analytics adapter factory

4. ⏳ **Testing**:
   - Generate real events via CLI commands
   - Verify V1 format in `.kb/analytics/buffer/events-*.jsonl`
   - Verify Studio UI shows Actor, Source, RunId columns
   - Test CI mode with `CI=true` environment variable

### Rollout Plan

**Phase 1: Infrastructure** (Completed)
- ✅ Define AnalyticsContext interface
- ✅ Update FileAnalytics to support V1 format
- ✅ Backward compatibility for legacy format

**Phase 2: Auto-Detection** (In Progress)
- 🔄 Create analytics-context.ts module
- 🔄 Integrate into PlatformServices loader
- 🔄 Test with real data

**Phase 3: Validation** (Pending)
- ⏳ Verify events in Studio UI
- ⏳ Test CI environment detection
- ⏳ Performance benchmarks (context creation overhead)

**Phase 4: Documentation**
- Update CLAUDE.md with V1 schema
- Document context auto-detection behavior
- Add troubleshooting guide for CI environments

### Future Enhancements

1. **Multi-Tenancy**: Add `tenantId` to context (field already exists in interface)
2. **Custom Context Providers**: Allow plugins to inject custom context via hooks
3. **Context Caching**: Cache git config results to avoid repeated execSync calls
4. **Remote Context**: Fetch context from remote telemetry service in distributed setups

## References

- [ADR-0016: Unified Observability Event System](./0016-unified-observability-event-system.md)
- [ADR-0017: File-Based Event Storage](./0017-file-based-event-storage.md)
- [Analytics Contracts](../../packages/analytics-contracts/README.md)
- [FileAnalytics Implementation](../../../kb-labs-adapters/packages/adapters-analytics-file/src/index.ts)

---

**Last Updated:** 2025-12-31
**Next Review:** 2026-03-31 (after Phase 3 completion)
