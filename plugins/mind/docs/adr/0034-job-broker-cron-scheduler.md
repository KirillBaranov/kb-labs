# ADR-0034: JobBroker and CronScheduler for Plugin Background Tasks

**Date:** 2025-11-28
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-28
**Tags:** [plugin-runtime, workflow-engine, background-jobs, scalability, redis]

## Context

Plugins in the KB Labs ecosystem need the ability to execute background tasks and scheduled operations:

- **Background Jobs** - One-time asynchronous tasks (e.g., data processing, batch operations)
- **Scheduled Tasks** - Recurring operations with cron-like scheduling (e.g., daily reports, periodic indexing)

### Requirements

1. **Simple API** - Plugin contributors should have a straightforward interface for job submission
2. **Distributed Scaling** - System must support multi-instance deployments with Redis coordination
3. **Load Management** - Adaptive throttling based on system resources (CPU, memory, queue depth)
4. **Permission Control** - Manifest-based permissions for handlers, quotas, timeouts
5. **Flexible Scheduling** - Support both cron expressions and simple interval syntax
6. **Integration** - Leverage existing workflow-engine infrastructure
7. **Observability** - Job status tracking, logs, health monitoring

### Constraints

- Must use workflow-engine as the execution backend
- Must follow existing broker pattern (InvokeBroker, ArtifactBroker, ShellBroker)
- Must use Redis for persistence and coordination
- Must support horizontal scaling

### Alternatives Considered

#### Alternative 1: Unified API (Single Method)

```typescript
// Single method with discriminated union
ctx.jobs.execute({
  type: 'once' | 'scheduled',
  handler: '...',
  schedule?: string,
  ...
});
```

**Pros:**
- Single method to learn
- Fewer API surface

**Cons:**
- Confusing optional fields (schedule only for type='scheduled')
- Poor TypeScript ergonomics (discriminated unions are verbose)
- Difficult to extend with type-specific options

**Rejected:** Poor developer experience with TypeScript, confusing API surface.

#### Alternative 2: Split API (Chosen)

```typescript
// Separate methods for different use cases
ctx.jobs.submit({ handler: '...', input: {...} });  // One-time
ctx.jobs.schedule({ handler: '...', schedule: '...' });  // Recurring
```

**Pros:**
- Clear separation of concerns
- Excellent TypeScript ergonomics
- Easy to extend with type-specific options
- Mirrors existing patterns (fs.readFile vs fs.createReadStream)

**Cons:**
- Two methods to document
- Slightly larger API surface

**Chosen:** Better developer experience, clearer intent, easier to extend.

#### Alternative 3: Custom Scheduler vs Cron Library

**Custom Parser:**
- Lightweight (~100 lines)
- Basic cron + interval syntax
- No dependencies

**Library (node-cron, cron-parser):**
- Full cron spec compliance
- Battle-tested
- Additional dependency

**Chosen:** Custom parser for MVP. Simple implementation handles common use cases. Can upgrade to library if advanced cron features needed (e.g., `@yearly`, `L` for last day of month).

#### Alternative 4: Degradation Strategy

**Option A: Hard Limits**
- Reject jobs when CPU/memory exceeds threshold
- Simple, predictable
- Risk of cascading failures

**Option B: State Machine with Delays (Chosen)**
- Three states: normal → degraded → critical
- Gradual degradation with configurable delays
- Graceful handling of overload
- More complex implementation

**Chosen:** State machine approach provides better user experience and prevents cascading failures.

## Decision

### Architecture

We implement a **JobBroker** and **CronScheduler** system with the following architecture:

```
Plugin Handler
     ↓
PluginContext.jobs (JobBroker)
     ↓
┌────────────────────────────────────┐
│         JobBroker                   │
│  - Permission checking              │
│  - Quota enforcement                │
│  - Degradation checks               │
│  - WorkflowEngine integration       │
└────────────────────────────────────┘
     ↓                    ↓
WorkflowEngine      CronScheduler
     ↓                    ↓
   Redis            Redis (sorted set)
```

### Component Breakdown

#### 1. JobBroker

Main facade for job operations:

```typescript
class JobBroker {
  async submit(request: BackgroundJobRequest): Promise<JobHandle>
  async schedule(request: ScheduledJobRequest): Promise<ScheduleHandle>
  async healthCheck(): Promise<HealthCheckResult>
}
```

**Responsibilities:**
- Permission validation against manifest
- Quota checking (per-minute, per-hour, per-day)
- Degradation state checking
- Creating WorkflowSpec from job request
- Wrapping WorkflowRun in JobHandle

#### 2. CronScheduler

Redis-based recurring job scheduler:

```typescript
class CronScheduler {
  async register(entry: ScheduleEntry): Promise<string>
  async cancel(scheduleId: string): Promise<void>
  async pause(scheduleId: string): Promise<void>
  async resume(scheduleId: string): Promise<void>
  async getSchedule(scheduleId: string): Promise<ScheduleEntry | null>
  async listSchedules(): Promise<ScheduleEntry[]>
}
```

**Implementation:**
- **Persistence:** Redis sorted set (`kb:schedules:active`) keyed by next run time
- **Ticker:** Polls every 5 seconds for due jobs
- **Pub/Sub:** Publishes triggered jobs to `kb:cron:triggered`
- **Leader Election:** Only one instance runs the ticker (future enhancement)

**Schedule Syntax:**
- **Cron:** `"0 9 * * *"` (every day at 9 AM)
- **Interval:** `"5m"`, `"1h"`, `"30s"` (every 5 minutes, hour, 30 seconds)

#### 3. DegradationController

Adaptive throttling based on system metrics:

```typescript
class DegradationController {
  start(): void
  stop(): void
  getState(): DegradationState  // 'normal' | 'degraded' | 'critical'
  getMetrics(): SystemMetrics | null
  getSubmitDelay(): number
  shouldRejectSubmit(): boolean
  shouldPauseSchedules(): boolean
  healthCheck(): Promise<HealthCheckResult>
}
```

**State Machine:**

```
normal ──[metrics > degraded]──> degraded ──[metrics > critical]──> critical
  ↑                                  ↓                                  ↓
  └─────[metrics < normal]───────────┘                                  │
  └───────────────────[metrics < degraded]────────────────────────────┘
```

**Monitored Metrics:**
- CPU usage (average across cores)
- Memory usage (system percentage)
- Queue depth (pending jobs in Redis)
- Active jobs (running workflows)

**Default Thresholds:**
```typescript
{
  cpu: { degraded: 70, critical: 90, normal: 50 },
  memory: { degraded: 75, critical: 90, normal: 60 },
  queueDepth: { degraded: 100, critical: 500, normal: 50 }
}
```

**Actions:**
- **normal:** No delays, all jobs accepted
- **degraded:** 1s delay, jobs accepted
- **critical:** 5s delay OR rejection (configurable), schedules paused

**Debouncing:** 30s delay before state transitions to prevent flapping.

#### 4. QuotaTracker

Time-window based quota enforcement:

```typescript
class QuotaTracker {
  async checkSubmitQuota(): Promise<QuotaResult>
  async checkScheduleQuota(): Promise<QuotaResult>
  async incrementQuota(type: 'submit' | 'schedule'): Promise<void>
}
```

**Implementation:**
- Redis sorted sets keyed by plugin ID and quota window
- Sliding windows (perMinute, perHour, perDay)
- Automatic expiration of old entries

#### 5. Manifest Permissions

Plugins declare job permissions in manifest:

```typescript
permissions: {
  jobs: {
    submit: {
      handlers: ['handlers/*.ts'],
      quotas: { perMinute: 100, perHour: 1000, perDay: 10000 },
      timeoutLimits: { min: 1000, max: 600000 }
    },
    schedule: {
      handlers: ['handlers/cron-*.ts'],
      quotas: { perMinute: 10, perHour: 100, perDay: 500 },
      intervalLimits: { min: 60000, max: 86400000 }
    }
  }
}
```

### API Design

#### Submit Background Job

```typescript
const handle = await ctx.jobs.submit({
  handler: 'handlers/process-data.ts',
  input: { dataId: '12345' },
  priority: 8,        // 1-10, maps to high/normal/low
  delay: 5000,        // 5s delay
  timeout: 60000,     // 1 minute
  retries: 3,
  tags: ['batch']
});

// Wait for result
const result = await handle.getResult();
```

#### Schedule Recurring Job

```typescript
const handle = await ctx.jobs.schedule({
  handler: 'handlers/daily-report.ts',
  schedule: '0 9 * * *',  // Every day at 9 AM
  input: { reportType: 'sales' },
  priority: 7,
  timeout: 300000,
  maxRuns: 30  // Stop after 30 executions
});

// Pause/resume
await handle.pause();
await handle.resume();
```

### Integration with WorkflowEngine

JobBroker creates `WorkflowSpec` from job requests:

```typescript
// Priority mapping
1-3   → 'low'
4-7   → 'normal'
8-10  → 'high'

// WorkflowSpec creation
const spec: WorkflowSpec = {
  workflowId: `job-${jobId}`,
  handler: request.handler,
  input: request.input,
  priority: mapPriority(request.priority),
  timeout: request.timeout,
  retries: request.retries,
  metadata: {
    pluginId: manifest.name,
    tags: request.tags,
    source: 'job-broker'
  }
};

const run = await workflowEngine.submit(spec);
```

CronScheduler publishes triggered jobs to Redis pub/sub:

```typescript
// Publisher (CronScheduler)
redis.publish('kb:cron:triggered', JSON.stringify({
  scheduleId,
  triggeredAt: Date.now(),
  spec: jobSpec
}));

// Subscriber (JobBroker)
redis.subscribe('kb:cron:triggered', (message) => {
  const { spec } = JSON.parse(message);
  workflowEngine.submit(spec);
});
```

## Consequences

### Positive

1. **Simple API** - Plugin contributors have clear, type-safe methods for job operations
2. **Distributed Scaling** - Redis-based coordination enables horizontal scaling
3. **Load Management** - Adaptive throttling prevents system overload
4. **Flexibility** - Hybrid cron syntax (expressions + intervals) covers most use cases
5. **Integration** - Seamless integration with existing workflow-engine
6. **Permission Control** - Manifest-based permissions provide security and resource control
7. **Observability** - Health checks, logs, and status tracking enable monitoring

### Negative

1. **Complexity** - State machine and degradation logic adds complexity
2. **Redis Dependency** - System requires Redis for coordination
3. **Ticker Overhead** - CronScheduler polls every 5 seconds (future: event-driven)
4. **Limited Cron** - Custom parser doesn't support advanced cron features (`@yearly`, `L`, etc.)
5. **No Distributed Locking** - Initial implementation doesn't use leader election (all instances run ticker)

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Ticker inefficiency with many schedules | Use Redis sorted set for O(log N) range queries |
| Duplicate executions in multi-instance | Implement leader election (future enhancement) |
| State flapping during load spikes | 30s debounce for state transitions |
| Quota bypass with multiple instances | Shared Redis-based quota tracking |
| Clock skew in distributed system | Use Redis server time for consistency |

### Alternatives Rejected (Summary)

- **Unified API** - Rejected for poor TypeScript ergonomics
- **Hard limits degradation** - Rejected for risk of cascading failures
- **Third-party cron library** - Deferred for simplicity; can upgrade later
- **In-memory scheduling** - Rejected for lack of persistence and distributed support

## Implementation

### Files Changed/Created

**Plugin Runtime:**
- `kb-labs-plugin/packages/runtime/src/jobs/broker.ts` - JobBroker implementation
- `kb-labs-plugin/packages/runtime/src/jobs/types.ts` - TypeScript interfaces
- `kb-labs-plugin/packages/runtime/src/jobs/permissions.ts` - Permission checking
- `kb-labs-plugin/packages/runtime/src/jobs/quotas.ts` - Quota enforcement
- `kb-labs-plugin/packages/runtime/src/jobs/handles.ts` - JobHandle/ScheduleHandle wrappers
- `kb-labs-plugin/packages/runtime/src/jobs/cron/scheduler.ts` - CronScheduler
- `kb-labs-plugin/packages/runtime/src/jobs/cron/parser.ts` - Cron/interval parser
- `kb-labs-plugin/packages/runtime/src/jobs/cron/types.ts` - CronScheduler types
- `kb-labs-plugin/packages/runtime/src/jobs/degradation/controller.ts` - DegradationController
- `kb-labs-plugin/packages/runtime/src/jobs/degradation/metrics.ts` - SystemMetricsCollector
- `kb-labs-plugin/packages/runtime/src/jobs/degradation/types.ts` - Degradation types
- `kb-labs-plugin/packages/runtime/src/context/plugin-context.ts` - Added jobs field
- `kb-labs-plugin/packages/runtime/src/context/capabilities.ts` - Added JobsSubmit/JobsSchedule
- `kb-labs-plugin/packages/runtime/src/context/broker-factory.ts` - createJobBroker factory
- `kb-labs-plugin/packages/runtime/src/index.ts` - Exports

**Manifest:**
- `kb-labs-plugin/packages/manifest/src/types.ts` - Added JobPermission interfaces

**Workflow Engine:**
- `kb-labs-workflow/packages/workflow-engine/src/engine.ts` - CronScheduler/DegradationController integration

**Documentation:**
- `kb-labs-plugin/packages/runtime/docs/jobs-api.md` - API documentation
- `kb-labs-mind/docs/adr/0034-job-broker-cron-scheduler.md` - This ADR

### Migration Path

**For Plugin Developers:**

1. Add job permissions to manifest:
```typescript
permissions: {
  jobs: {
    submit: { handlers: ['handlers/*.ts'], ... },
    schedule: { handlers: ['handlers/cron-*.ts'], ... }
  }
}
```

2. Use JobBroker in handlers:
```typescript
export default async function handler(ctx: PluginContext, input: any) {
  const job = await ctx.jobs.submit({ ... });
  return { jobId: job.id };
}
```

**For Platform Operators:**

1. Update WorkflowEngine initialization:
```typescript
const cron = new CronScheduler(redis);
const degradation = new DegradationController(redis);
const engine = new WorkflowEngine(redis, { cronScheduler: cron, degradation });
degradation.start();
```

2. Monitor degradation events:
```typescript
redis.subscribe('kb:degradation:events', (event) => {
  const { oldState, newState, metrics } = JSON.parse(event);
  console.log(`State change: ${oldState} → ${newState}`, metrics);
});
```

### Future Enhancements

1. **Leader Election** - Ensure only one instance runs CronScheduler ticker
2. **Advanced Cron** - Upgrade to full cron library for `@yearly`, `L`, etc.
3. **Event-Driven Scheduling** - Use Redis keyspace notifications instead of ticker
4. **Job Dependencies** - Support job chains (job B waits for job A)
5. **Dead Letter Queue** - Capture and replay failed jobs
6. **Job Prioritization** - Dynamic priority adjustment based on SLA
7. **Cost Tracking** - Track resource usage per plugin/tenant

### Rollback Plan

If issues arise:

1. **Disable degradation:** Set `rejectOnCritical: false`, remove delays
2. **Disable cron:** Stop CronScheduler ticker
3. **Disable quotas:** Set quotas to very high values
4. **Feature flag:** Add `ENABLE_JOB_BROKER` flag to gradually roll out

## References

- [JobBroker API Documentation](../../../kb-labs-plugin/packages/runtime/docs/jobs-api.md)
- [Workflow Engine Documentation](../../../kb-labs-workflow/packages/workflow-engine/README.md)
- [Plugin System Architecture](../../plugin-system-architecture.md)
- [InvokeBroker Implementation](../../../kb-labs-plugin/packages/runtime/src/invoke/broker.ts)
- [Redis Sorted Sets](https://redis.io/docs/data-types/sorted-sets/)
- [Cron Expression Format](https://en.wikipedia.org/wiki/Cron)

---

**Last Updated:** 2025-11-28
**Next Review:** 2026-01-28 (2 months)
