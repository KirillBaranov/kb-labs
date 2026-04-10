# ADR-0016: Unified Observability Event System

**Date:** 2025-11-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-25
**Tags:** [observability, architecture, ai-ready]

## Context

The kb-labs platform is experiencing severe visibility issues during plugin execution:

1. **Current Problems:**
   - Logs/metrics scattered across multiple systems (console, IPC, files)
   - Crashes lose all diagnostic data (stderr buffering, IPC failures)
   - No way to correlate events across operations
   - Impossible to do post-mortem analysis after OOM crashes
   - No structured data for automated analysis

2. **Future Requirements:**
   - AI-powered crash analysis and recommendations
   - Real-time performance monitoring dashboards
   - Pattern detection for common issues
   - ML training data export
   - Community-shared issue patterns

3. **Platform Scale:**
   - Hundreds/thousands of plugin developers
   - Need production-grade debugging tools
   - Must work reliably in any crash scenario

### Alternatives Considered

**Option A: Multiple specialized systems**
- Separate logging library (Winston/Pino)
- Separate metrics library (Prometheus client)
- Separate tracing library (OpenTelemetry)

**Rejected because:**
- Hard to correlate data across systems
- Each system has its own storage/format
- Heavy dependencies
- Complex integration

**Option B: Stream to external service**
- Send all data to Sentry/Datadog/etc

**Rejected because:**
- Requires network (may not be available)
- Privacy concerns (sensitive code/data)
- Adds latency
- Vendor lock-in

**Option C: Unified event system (CHOSEN)**
- Single event schema for all observability data
- Pluggable outputs (file, console, AI, network)
- Local-first (works offline, survives crashes)
- AI-ready from day 1

## Decision

**We will implement a unified observability event system with the following design:**

### 1. Unified Event Schema

All events (logs, metrics, traces, errors, memory snapshots) use a single `ObservabilityEvent` type:

```typescript
interface ObservabilityEvent {
  id: string;                    // UUID
  timestamp: number;             // Unix ms
  type: 'log' | 'metric' | 'trace' | 'error' | 'memory';

  context: ExecutionContext;     // Operation correlation
  payload: Record<string, any>;  // Type-specific data
  relationships?: {              // Event graph
    causedBy?: string[];
    triggers?: string[];
  };

  aiHints?: {                    // ML metadata
    severity?: 1-10;
    category?: string;
    anomaly?: boolean;
    pattern?: string;
  };
}
```

### 2. EventCollector Hub

Central collection point routes events to pluggable sinks:

```typescript
class EventCollector {
  private sinks: Set<EventSink> = new Set();

  emit(event: ObservabilityEvent): void {
    for (const sink of this.sinks) {
      sink.write(event);  // Isolated failures
    }
  }
}
```

### 3. File-Based Primary Storage

Default sink writes structured JSONL to `/tmp/kb-{pid}-{timestamp}.log`:

- Survives any crash (append-only)
- Easy to parse (one JSON per line)
- Post-mortem analysis always possible
- No dependencies

### 4. Pluggable Architecture

Add new sinks without changing core:

```typescript
interface EventSink {
  write(event: ObservabilityEvent): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

// Future additions:
class AIAnalyzer implements EventSink { }
class SQLiteStorage implements EventSink { }
class WebSocketStreamer implements EventSink { }
```

### 5. AI-Ready Design

Schema includes `aiHints` field for ML:

- Severity scoring (1-10)
- Category labels
- Anomaly flags
- Pattern IDs
- Feature vectors

This allows AI integration without schema changes.

## Consequences

### Positive

1. **Reliability**: File storage survives any crash, always have diagnostic data
2. **Correlation**: Operation ID links all related events, easy to trace causality
3. **Extensibility**: Add AI/DB/network sinks without touching core
4. **AI-Ready**: Schema designed for ML from day 1, no future breaking changes
5. **Simplicity**: Single API for all observability, easier for developers
6. **Performance**: Async, non-blocking, buffered writes
7. **Post-Mortem**: Can always analyze what happened from log files
8. **Local-First**: Works offline, no network dependencies
9. **Standard Format**: JSONL/Chrome Tracing = existing tooling

### Negative

1. **File Cleanup**: Need to manage `/tmp` disk space (mitigated by rotation)
2. **Schema Evolution**: Need to maintain backward compatibility (mitigated by versioning)
3. **Learning Curve**: Developers must learn new API (mitigated by docs + examples)
4. **Initial Work**: Building from scratch vs using existing libraries

### Alternatives Rejected

**Winston/Pino**: Only handles logs, not metrics/traces/memory. No event correlation.

**OpenTelemetry**: Too heavy, complex API, overkill for single-process use case.

**Sentry/Datadog**: Network dependency, privacy concerns, vendor lock-in.

## Implementation

### Phase 1: Core (Done)

- [x] `ObservabilityEvent` schema
- [x] `EventCollector` hub
- [x] `FileLogger` sink
- [x] `ExecutionContext` tracking
- [x] Integration in bootstrap.ts

### Phase 2: Advanced (In Progress)

- [ ] `TraceRecorder` (Chrome tracing format)
- [ ] `HeapProfiler` (continuous snapshots)
- [ ] `PatternDetector` (rule-based analysis)
- [ ] `ConsoleLogger` (human-readable output)

### Phase 3: AI Integration (Future)

- [ ] `AIAnalyzer` sink (local model)
- [ ] `SQLiteStorage` sink (queryable history)
- [ ] ML training data export
- [ ] Pattern library (community-shared)

## References

- Implementation: `kb-labs-core/packages/sandbox/src/observability/`
- Related ADRs:
  - ADR-0017: File-Based Event Storage
  - ADR-0018: Chrome Tracing Format
  - ADR-0019: Event Sink Plugin Architecture
  - ADR-0011: Unified Logging System (superseded)

---

**Last Updated:** 2025-11-25
**Next Review:** 2026-01-25 (2 months)
