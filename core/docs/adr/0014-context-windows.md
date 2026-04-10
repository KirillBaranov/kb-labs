# ADR-0014: Context Windows for Log Analysis

**Date:** 2025-01-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-19
**Tags:** [architecture, logging, observability, ai]

## Context

When analyzing logs, especially for AI-powered insights, having context about preceding events is crucial:
- What happened before this error?
- What was the system state when this event occurred?
- What sequence of events led to this outcome?
- How can we provide context to AI models for better analysis?

Traditional log analysis requires:
- Manual searching for related events
- Reconstructing context from multiple log files
- No automatic way to provide context windows to AI
- Missing system state information

We need a mechanism to:
- Automatically maintain a window of recent events
- Capture system state snapshots
- Provide context to AI analysis
- Enable time-based and relationship-based queries

## Decision

We implement **context windows** that maintain a sliding window of recent log events and system state snapshots.

### Architecture

```
┌─────────────────────────────────────────┐
│ Log Event                                │
│ - time, level, msg, meta                 │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Context Window Manager                   │
│                                         │
│ - Maintains recent events (bounded)      │
│ - Captures system state snapshots       │
│ - Enables context queries               │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Context Queries                          │
│                                         │
│ - getPrecedingEvents(logId, count)       │
│ - getPrecedingEventsByTime(timestamp)   │
│ - getEventsByExecution(executionId)      │
│ - getEventsByTrace(traceId)              │
│ - getSystemStateSnapshot(timestamp)     │
└─────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Bounded In-Memory Storage

**Decision:** Store recent events and snapshots in memory with configurable limits.

**Rationale:**
- Fast queries (no I/O)
- Bounded memory usage (configurable limits)
- Recent events most relevant for context
- Can be exported to persistent storage if needed

**Defaults:**
- Max events: 50 (configurable)
- Max snapshots: 10 (configurable)

**Trade-off:** Limited history, but sufficient for most use cases.

#### 2. Automatic Event Storage

**Decision:** Automatically add logs to context window when AI is enabled.

**Rationale:**
- No developer effort required
- Consistent context across all logs
- Works transparently
- Can be disabled if needed

**Implementation:**
```typescript
if (aiConfig.mode === 'full' && features?.contextWindows?.enabled) {
    addToContextWindow(enriched);
}
```

#### 3. System State Snapshots

**Decision:** Allow explicit capture of system state at specific points.

**Rationale:**
- Provides context about system health
- Enables correlation with log events
- Useful for debugging and analysis
- Optional (not every log needs snapshot)

**Usage:**
```typescript
captureSystemStateSnapshot({
    metrics: { memory: 1024, cpu: 50 },
    contexts: { traceId: 'trace-123' },
});
```

#### 4. Multiple Query Patterns

**Decision:** Support different ways to retrieve context:
- By log ID (preceding N events)
- By time window (events within time range)
- By execution (all events in execution)
- By trace (all events in trace)

**Rationale:**
- Different use cases need different queries
- Flexible API supports various analysis patterns
- AI can use appropriate query for context

## Consequences

### Positive

- ✅ **Automatic context** - no manual searching needed
- ✅ **AI-ready** - provides context windows for ML models
- ✅ **Flexible queries** - multiple ways to retrieve context
- ✅ **System state** - captures metrics and system health
- ✅ **Bounded memory** - configurable limits prevent unbounded growth
- ✅ **Optional** - can be disabled if not needed

### Negative

- ⚠️ **Memory usage** - maintains events and snapshots in memory
- ⚠️ **Limited history** - only recent events available
- ⚠️ **Process boundaries** - context only within process
- ⚠️ **Manual snapshots** - system state must be captured explicitly

### Alternatives Considered

1. **Persistent storage**
   - Rejected: Too slow for real-time queries, adds complexity

2. **Unbounded storage**
   - Rejected: Memory would grow unbounded, performance issues

3. **External context service**
   - Rejected: Adds latency, complexity, network dependency

4. **Developer-provided context**
   - Rejected: Too much cognitive load, inconsistent

## Implementation

### Key Files

- `kb-labs-core/packages/sys/src/logging/context-window.ts` - Context window management
- `kb-labs-core/packages/sys/src/logging/ai-enrichment.ts` - Automatic integration

### Usage

```typescript
import { 
    enableContextWindow,
    getPrecedingEvents,
    getEventsByExecution,
    captureSystemStateSnapshot 
} from '@kb-labs/core-sys/logging';

// Enable context window
enableContextWindow({
    maxEntries: 100,
    maxSnapshots: 20,
});

// Get preceding events
const preceding = getPrecedingEvents('log-id', 10);

// Get events by execution
const executionEvents = getEventsByExecution('exec-123');

// Capture system state
captureSystemStateSnapshot({
    metrics: { memory: 1024, cpu: 50 },
    contexts: { traceId: 'trace-123' },
});
```

### Configuration

```json
{
  "logging": {
    "ai": {
      "mode": "full",
      "features": {
        "contextWindows": {
          "enabled": true,
          "precedingEvents": 10,
          "systemStateSnapshot": true
        }
      }
    }
  }
}
```

## References

- [ADR-0011: Unified Logging System](./0011-unified-logging-system.md)
- [ADR-0012: AI-Ready Log Enrichment](./0012-ai-ready-log-enrichment.md)
- [ADR-0013: Causality Tracking](./0013-causality-tracking.md)

---

**Last Updated:** 2025-01-19  
**Next Review:** 2025-07-19 (6 months)

