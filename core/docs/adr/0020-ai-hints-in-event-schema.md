# ADR-0020: AI Hints in Event Schema for Future ML Integration

**Date:** 2025-11-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-25
**Tags:** [observability, ai, ml, future-proof]

## Context

The observability system is designed to support future AI-powered analysis:

**Vision:**
- AI analyzes crashes and suggests fixes
- ML detects anomalies and patterns
- Automated root cause analysis
- Community-shared fix patterns
- Predictive issue detection

**Challenge:**
- AI features are 3-6 months away
- Schema must be stable from day 1
- Can't break compatibility when adding AI
- Need forward-compatible design

**Requirements:**
1. Schema ready for ML without breaking changes
2. Manual hints possible now
3. Automated hints later
4. Community pattern sharing
5. Zero overhead when not used

### Alternatives Considered

**Option A: Add AI fields later**
- Keep schema simple now
- **Rejected**: Schema breaking change, existing data invalid

**Option B: Separate AI metadata file**
- Event log + AI metadata file
- **Rejected**: Hard to correlate, two files to manage

**Option C: Optional AI hints field (CHOSEN)**
- Include `aiHints` field (optional)
- Empty now, populated later
- No breaking changes

**Option D: Version entire schema**
- `schemaVersion` field, different schemas
- **Rejected**: Complex version handling, data migration pain

## Decision

**Include optional `aiHints` field in event schema from day 1.**

### Schema Design

```typescript
interface ObservabilityEvent {
  // ... other fields ...

  aiHints?: {
    /** Severity score (1-10) for AI prioritization */
    severity?: 1-10;

    /** Category for pattern matching */
    category?: string; // 'memory-leak' | 'slow-operation' | ...

    /** Is this event anomalous? */
    anomaly?: boolean;

    /** Known pattern ID (if matches known issue) */
    pattern?: string;

    /** Confidence score (0-1) for automated detection */
    confidence?: number;

    /** Feature vector for ML (future use) */
    features?: Record<string, number>;
  };
}
```

### Current Usage (Manual)

Developers can add hints now:

```typescript
collector.emit(createErrorEvent(
  context,
  error,
  {
    aiHints: {
      severity: 10,        // Critical
      category: 'crash',
      anomaly: true,
    }
  }
));
```

### Future Usage (Automated)

AI adds hints automatically:

```typescript
class AIAnalyzer implements EventSink {
  write(event: ObservabilityEvent) {
    // Analyze event
    const analysis = analyzeEvent(event);

    // Add AI hints
    event.aiHints = {
      severity: analysis.severity,
      category: analysis.category,
      anomaly: analysis.isAnomaly,
      pattern: matchKnownPattern(event),
      confidence: analysis.confidence,
    };

    // Store for training
    storeForML(event);
  }
}
```

### Categories (Examples)

- `memory-leak` - Unbounded memory growth
- `slow-operation` - Performance bottleneck
- `error-spike` - Sudden error increase
- `crash` - Unexpected termination
- `timeout` - Operation timeout
- `resource-exhaustion` - CPU/memory/disk limit

## Consequences

### Positive

1. **Future-Proof**: No schema changes needed for AI
2. **Forward Compatible**: Old parsers ignore unknown fields
3. **Manual + Auto**: Can add hints manually now, automatically later
4. **Zero Overhead**: Optional field, no cost when unused
5. **Flexible**: Can add new hint types without breaking
6. **ML Ready**: Feature vectors prepared
7. **Community Patterns**: Pattern IDs enable sharing

### Negative

1. **Empty Field**: Most events have `aiHints: undefined` initially
2. **Schema Size**: Adds field to every event (mitigated: optional, small)
3. **Premature Design**: Might not match actual AI needs (mitigated: flexible structure)

### Alternatives Rejected

**Add later**: Would require schema version bump, data migration

**Separate file**: Hard to correlate events with AI metadata

**Schema versioning**: Complex, painful migrations

## Implementation

### Phase 1: Schema (Done)
- [x] Add `aiHints` field to schema
- [x] Document categories
- [x] Manual hints in code

### Phase 2: Manual Hints (Done)
- [x] Error events get severity
- [x] Memory events get severity based on usage
- [x] Crash events marked as anomalies

### Phase 3: Rule-Based (In Progress)
- [ ] PatternDetector adds hints
- [ ] Known pattern library
- [ ] Severity scoring rules

### Phase 4: ML Integration (Future)
- [ ] Local ML model for hints
- [ ] Feature extraction
- [ ] Pattern learning
- [ ] Community pattern sharing

### Example Usage

**Now (Manual):**
```typescript
collector.emit(createMemoryEvent(
  context,
  { snapshot },
  {
    aiHints: {
      severity: mem.heapUsed > 2GB ? 7 : 3,
    }
  }
));
```

**Future (Automated):**
```typescript
// AI analyzer runs automatically
collector.addSink(new AIAnalyzer({
  model: 'local-crash-detector',
  confidence: 0.8,
}));

// AI adds hints to all events
// No code changes needed!
```

## References

- Schema: `kb-labs-core/packages/sandbox/src/observability/events/schema.ts`
- Related ADRs:
  - ADR-0016: Unified Observability Event System
  - ADR-0012: AI-Ready Log Enrichment (related concept)

---

**Last Updated:** 2025-11-25
**Next Review:** 2026-01-25
