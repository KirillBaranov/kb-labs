# ADR-0013: Causality Tracking in Logs

**Date:** 2025-01-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-19
**Tags:** [architecture, logging, observability, distributed-tracing]

## Context

In distributed systems and complex workflows, understanding relationships between log events is crucial:
- Which action caused an error?
- What sequence of events led to a failure?
- How are events in a transaction related?
- What is the execution flow through multiple services?

Traditional logs are flat - each log entry is independent. To understand causality, engineers must:
- Manually correlate logs by timestamps
- Search for related trace IDs
- Reconstruct execution flows mentally
- Miss subtle relationships

We need automatic detection and tracking of relationships between log events to enable:
- AI-powered root cause analysis
- Automated workflow visualization
- Pattern detection in event sequences
- Better debugging of distributed systems

## Decision

We implement **causality tracking** that automatically detects and records relationships between log events.

### Architecture

```
┌─────────────────────────────────────────┐
│ Log Event 1                              │
│ - executionId: 'exec-123'               │
│ - trace: 'trace-1', span: 'span-1'      │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Causality Tracker                        │
│                                         │
│ - Maintains recent logs window           │
│ - Detects relationships                  │
│ - Creates log groups                     │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Log Event 2                              │
│ - executionId: 'exec-123'               │
│ - trace: 'trace-1', span: 'span-2'      │
│ - parentSpan: 'span-1'                  │
│                                         │
│ relationships: {                         │
│   parents: [{                            │
│     logId: 'trace-1:span-1',            │
│     relationship: 'caused-by'           │
│   }],                                    │
│   group: {                               │
│     groupId: 'exec-exec-123',            │
│     groupType: 'workflow'                │
│   }                                      │
│ }                                        │
└─────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Relationship Detection Strategies

**Decision:** Use multiple heuristics to detect relationships:
- Execution context (same `executionId`)
- Distributed tracing (trace/span hierarchy)
- Semantic relationships (action → error in same domain)
- Temporal proximity (events within time window)

**Rationale:**
- No single strategy catches all relationships
- Multiple signals increase accuracy
- Can be enhanced with ML later
- Works with existing trace/span infrastructure

**Detection Rules:**
```typescript
// Execution context
if (log1.executionId === log2.executionId) → 'follows'

// Trace/span hierarchy
if (log2.parentSpan === log1.span) → 'caused-by'

// Semantic: error after action
if (log1.semantics.intent === 'action' && 
    log2.semantics.intent === 'error' &&
    same domain) → 'caused-by'
```

#### 2. Log Groups

**Decision:** Automatically group related logs by execution or trace.

**Rationale:**
- Groups enable workflow visualization
- Easier to analyze related events together
- Supports transaction boundaries
- Natural abstraction for AI analysis

**Group Types:**
- `workflow` - grouped by `executionId`
- `transaction` - grouped by `traceId`
- `cascade` - error propagation chains
- `session` - user session events
- `request` - HTTP request lifecycle

#### 3. In-Memory State Management

**Decision:** Store causality state in memory with bounded size.

**Rationale:**
- Fast relationship detection (no I/O)
- Bounded memory usage (recent logs window)
- Works across process boundaries via trace IDs
- Can be exported to persistent storage if needed

**Trade-off:** State lost on restart, but relationships are in log records themselves.

#### 4. Confidence Scores

**Decision:** Include confidence scores for detected relationships.

**Rationale:**
- Some relationships are more certain than others
- AI can use confidence for filtering
- Helps debug false positives
- Enables ML-based improvement

**Confidence Levels:**
- `0.9` - Strong (trace/span hierarchy)
- `0.8` - High (execution context)
- `0.7` - Medium (semantic relationships)
- `0.5-0.6` - Low (temporal proximity)

## Consequences

### Positive

- ✅ **Automatic relationship detection** - no manual correlation needed
- ✅ **Workflow visualization** - groups enable flow diagrams
- ✅ **Better debugging** - see what caused what
- ✅ **AI-ready** - structured relationships for ML analysis
- ✅ **Bounded memory** - recent logs window prevents unbounded growth
- ✅ **Works with existing infrastructure** - uses trace/span IDs

### Negative

- ⚠️ **Memory usage** - maintains recent logs in memory
- ⚠️ **False positives** - may detect incorrect relationships
- ⚠️ **Process boundaries** - relationships only within process
- ⚠️ **Configuration needed** - must enable in AI config

### Alternatives Considered

1. **Post-processing analysis**
   - Rejected: Too slow, can't enrich logs in real-time

2. **Developer-provided relationships**
   - Rejected: Too much cognitive load, inconsistent

3. **ML-only detection**
   - Rejected: Requires training data, slower, harder to debug

4. **Persistent storage**
   - Rejected: Too slow for real-time enrichment, adds complexity

## Implementation

### Key Files

- `kb-labs-core/packages/sys/src/logging/causality-tracker.ts` - Core tracking logic
- `kb-labs-core/packages/sys/src/logging/ai-enrichment.ts` - Integration with enrichment

### Usage

```typescript
import { configureAI, getLogger } from '@kb-labs/core-sys/logging';

configureAI({
  mode: 'full',
  features: {
    causality: {
      enabled: true,
      trackRelationships: true,
    },
  },
});

const logger = getLogger('my-plugin');
logger.info('Action started', { executionId: 'exec-123' });
logger.info('Action completed', { executionId: 'exec-123' });

// Relationships automatically detected and added to log records
```

### API

```typescript
import { getLogRelationships, getLogGroup } from '@kb-labs/core-sys/logging';

// Get relationships for a log
const relationships = getLogRelationships('log-id');

// Get group information
const group = getLogGroup('exec-123');
```

## References

- [ADR-0011: Unified Logging System](./0011-unified-logging-system.md)
- [ADR-0012: AI-Ready Log Enrichment](./0012-ai-ready-log-enrichment.md)

---

**Last Updated:** 2025-01-19  
**Next Review:** 2025-07-19 (6 months)

