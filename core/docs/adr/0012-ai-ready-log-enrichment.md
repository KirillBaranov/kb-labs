# ADR-0012: AI-Ready Log Enrichment Architecture

**Date:** 2025-01-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-19
**Tags:** [architecture, logging, ai, observability]

## Context

As KB Labs platform evolves, logs become a critical source of data for:
- AI-powered analysis and insights
- Automated debugging and root cause analysis
- Pattern detection and anomaly identification
- Predictive maintenance and optimization

However, raw logs lack semantic structure that AI systems need:
- No explicit intent or operation type
- No relationships between related events
- No standardized format for embeddings
- No privacy/compliance metadata
- No context about system state

We need to enrich logs with structured metadata that makes them AI-ready while maintaining:
- Zero overhead when AI features are disabled
- Backward compatibility with existing code
- Progressive enhancement (opt-in advanced features)
- Platform-driven enrichment (minimal developer effort)

## Decision

We extend the logging system with **conditional AI enrichment** that adds structured metadata to log records only when explicitly enabled.

### Architecture

```
┌─────────────────────────────────────────┐
│ Log Record (base)                       │
│ - time, level, category, msg, meta      │
└─────────────────────────────────────────┘
          ↓ (if AI enabled)
┌─────────────────────────────────────────┐
│ AI Enrichment Layer                      │
│                                         │
│ - Semantic inference                    │
│ - Entity extraction                     │
│ - Privacy detection                     │
│ - Embedding preparation                 │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Enriched Log Record                      │
│ - semantics: { intent, operation, ... } │
│ - nlp: { entities, sentiment }          │
│ - embedding: { text, meta }            │
│ - privacy: { piiTypes, sensitivity }    │
└─────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Conditional Enrichment

**Decision:** Enrichment happens only when `aiConfig.mode !== 'off'`.

**Rationale:**
- Zero overhead when disabled (single check)
- Backward compatible by default
- Explicit opt-in prevents accidental data collection
- Performance-critical paths remain fast

**Implementation:**
```typescript
const enrichedRec = state.aiConfig?.mode !== 'off' 
    ? enrichLogRecord(rec)
    : rec;
```

#### 2. Extended LogRecord Interface

**Decision:** Add optional AI fields to `LogRecord` interface.

**Rationale:**
- Type-safe API
- Clear contract for AI consumers
- Optional fields don't break existing code
- Can be serialized/deserialized consistently

**Fields Added:**
- `semantics` - intent, operation, outcome, domain
- `nlp` - entities, language, sentiment
- `embedding` - prepared text and metadata
- `privacy` - PII detection, sensitivity, compliance
- `relationships` - causal links (see ADR-0013)
- `ai` - schema version, supported features

#### 3. Pattern-Based Inference (Phase 1)

**Decision:** Use pattern matching and rule-based inference for semantic enrichment.

**Rationale:**
- No ML dependencies (faster, simpler)
- Deterministic and explainable
- Works immediately without training
- Can be enhanced with ML later

**Patterns:**
- Intent: keywords ("created", "failed", "took", "initialized")
- Operation: verb extraction ("create", "update", "delete")
- Outcome: level-based ("error" → "failure")
- Domain: category/plugin extraction

#### 4. Progressive Enhancement

**Decision:** Three modes: `off`, `basic`, `full`.

**Rationale:**
- `off`: Zero overhead, backward compatible
- `basic`: Pattern-based enrichment (no ML)
- `full`: All features including ML (future)

**Configuration:**
```typescript
configureAI({ mode: 'basic' }); // Pattern-based only
configureAI({ mode: 'full' });  // All features
```

#### 5. Platform-Driven Enrichment

**Decision:** Enrichment happens automatically in the logging layer, not by developers.

**Rationale:**
- Developers just log normally: `logger.info('User created project')`
- Platform infers semantics automatically
- Consistent enrichment across all plugins
- No cognitive load on developers

**Trade-off:** Less control, but simpler API.

## Consequences

### Positive

- ✅ **AI-ready logs** - structured metadata for ML analysis
- ✅ **Zero overhead** - disabled by default, single check when enabled
- ✅ **Backward compatible** - existing code works unchanged
- ✅ **Progressive enhancement** - opt-in advanced features
- ✅ **Platform-driven** - automatic enrichment, minimal developer effort
- ✅ **Type-safe** - TypeScript interfaces for all fields
- ✅ **Extensible** - easy to add new enrichment types

### Negative

- ⚠️ **Additional fields** - larger log records (but optional)
- ⚠️ **Pattern limitations** - may miss some semantic nuances
- ⚠️ **Configuration complexity** - more options to understand

### Alternatives Considered

1. **ML-only enrichment**
   - Rejected: Requires training data, slower, harder to debug

2. **Developer-provided semantics**
   - Rejected: Too much cognitive load, inconsistent across plugins

3. **Always-on enrichment**
   - Rejected: Performance overhead, privacy concerns

4. **Separate AI logging API**
   - Rejected: Duplication, developers would need to learn two APIs

## Implementation

### Key Files

- `kb-labs-core/packages/sys/src/logging/types/types.ts` - Extended `LogRecord` interface
- `kb-labs-core/packages/sys/src/logging/types/ai-config.ts` - AI configuration types
- `kb-labs-core/packages/sys/src/logging/ai-enrichment.ts` - Enrichment logic
- `kb-labs-core/packages/sys/src/logging/ai-config.ts` - Configuration API
- `kb-labs-core/packages/sys/src/logging/state.ts` - Global AI config state

### Usage

```typescript
// Enable AI enrichment
import { configureAI, getLogger } from '@kb-labs/core-sys/logging';

configureAI({ mode: 'basic' });

const logger = getLogger('my-plugin');
logger.info('User created project', { userId: '123' });

// Automatically enriched with:
// - semantics: { intent: 'action', operation: 'create', outcome: 'success' }
// - nlp: { entities: [{ type: 'user', value: '123' }] }
// - embedding: { embeddingText: '...', embeddingMeta: {...} }
```

### Configuration

```json
{
  "logging": {
    "ai": {
      "mode": "basic",
      "features": {
        "semanticTags": true,
        "embeddings": { "enabled": true },
        "nlp": { "enabled": true, "extractEntities": true },
        "privacy": { "autoDetectPII": true }
      }
    }
  }
}
```

## References

- [ADR-0011: Unified Logging System](./0011-unified-logging-system.md)
- [ADR-0013: Causality Tracking](./0013-causality-tracking.md)
- [ADR-0014: Sensitive Data Detection](./0014-sensitive-data-detection.md)

---

**Last Updated:** 2025-01-19  
**Next Review:** 2025-07-19 (6 months)

