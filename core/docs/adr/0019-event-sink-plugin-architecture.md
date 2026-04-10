# ADR-0019: Event Sink Plugin Architecture

**Date:** 2025-11-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-25
**Tags:** [observability, architecture, extensibility]

## Context

The observability system must support diverse output destinations:

**Current Needs:**
- File storage (reliability)
- Console output (development)

**Future Needs:**
- AI analyzer (recommendations)
- SQLite storage (queries)
- WebSocket streaming (live dashboards)
- Sentry/Datadog (external services)
- Custom plugins (community)

**Requirements:**
1. Add new outputs without modifying core
2. Isolate failures (one sink fails, others continue)
3. Different sinks for different environments
4. Easy to test (mock sinks)
5. Simple interface

### Alternatives Considered

**Option A: Hard-coded outputs**
```typescript
class EventCollector {
  emit(event) {
    writeToFile(event);
    writeToConsole(event);
    sendToAI(event);
  }
}
```
- **Rejected**: Not extensible, tightly coupled

**Option B: Observer pattern with callbacks**
```typescript
eventCollector.on('event', (e) => handleEvent(e));
```
- **Rejected**: Loose typing, no lifecycle management

**Option C: Plugin interface (CHOSEN)**
```typescript
interface EventSink {
  write(event: ObservabilityEvent): void;
}
```
- Simple, typed, testable, extensible

## Decision

**Use EventSink plugin interface with isolated failure handling.**

### Design

**Core Interface:**
```typescript
interface EventSink {
  write(event: ObservabilityEvent): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
```

**Registration:**
```typescript
class EventCollector {
  private sinks: Set<EventSink> = new Set();

  addSink(sink: EventSink): void {
    this.sinks.add(sink);
  }

  emit(event: ObservabilityEvent): void {
    for (const sink of this.sinks) {
      try {
        sink.write(event);
      } catch (err) {
        // Isolated failure - log but continue
      }
    }
  }
}
```

**Built-in Sinks:**
- `FileLogger` - append-only JSONL files
- `ConsoleLogger` - human-readable console (future)

**Future Sinks:**
- `AIAnalyzer` - pattern detection + recommendations
- `SQLiteStorage` - queryable event database
- `WebSocketStreamer` - real-time streaming to UI
- `SentryIntegration` - error reporting
- `DatadogIntegration` - APM metrics

### Usage Example

```typescript
// Setup
const collector = new EventCollector();
collector.addSink(new FileLogger({ logDir: '/tmp' }));
collector.addSink(new ConsoleLogger({ colors: true }));

// Emit
collector.emit(createLogEvent(...));

// Cleanup
await collector.flush();
await collector.close();
```

### Failure Isolation

Each sink operates independently:

```typescript
// Sink A fails
try {
  sinkA.write(event); // throws
} catch {
  stderr.write('Sink A failed');
  // Continue to sink B
}

// Sink B succeeds
sinkB.write(event); // works
```

## Consequences

### Positive

1. **Extensibility**: Add sinks without touching core
2. **Testability**: Easy to mock/spy on sinks
3. **Reliability**: Sink failures don't stop collection
4. **Flexibility**: Different sinks per environment
5. **Simplicity**: Minimal interface
6. **Type Safety**: Full TypeScript types
7. **Composition**: Combine multiple sinks easily

### Negative

1. **No Built-in Filtering**: Each sink must filter (mitigated: add FilterableEventSink)
2. **No Priority**: All sinks equal (mitigated: can add priority if needed)
3. **Sync/Async Mix**: Interface allows both (mitigated: handle Promises properly)

### Alternatives Rejected

**Hard-coded outputs**: Not extensible

**Observer callbacks**: Loose typing, complex lifecycle

**Pub-sub library**: Overkill, adds dependency

## Implementation

### Phase 1: Core (Done)
- [x] EventSink interface
- [x] EventCollector with sink management
- [x] FileLogger sink
- [x] Failure isolation

### Phase 2: Built-in Sinks (In Progress)
- [ ] ConsoleLogger (human-readable)
- [ ] TraceExporter (Chrome format)
- [ ] FilterableEventSink (with filtering)

### Phase 3: Advanced Sinks (Future)
- [ ] AIAnalyzer (pattern detection)
- [ ] SQLiteStorage (queryable)
- [ ] WebSocketStreamer (real-time)
- [ ] SentryIntegration (errors)
- [ ] DatadogIntegration (metrics)

### Extension Example

Community can create custom sinks:

```typescript
// @acme/kb-slack-sink
class SlackSink implements EventSink {
  async write(event: ObservabilityEvent) {
    if (event.type === 'error') {
      await postToSlack({
        text: event.payload.message,
        channel: '#alerts'
      });
    }
  }
}

// Usage
collector.addSink(new SlackSink({ webhook: '...' }));
```

## References

- Implementation: `kb-labs-core/packages/sandbox/src/observability/outputs/types.ts`
- Related ADRs:
  - ADR-0016: Unified Observability Event System
  - ADR-0017: File-Based Event Storage

---

**Last Updated:** 2025-11-25
**Next Review:** 2026-01-25
