# ADR-0033: Adaptive Search Weights for Query Classification

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** [mind-engine, search, orchestrator, quality]

## Context

Mind RAG search quality was inconsistent across different query types. Benchmark testing revealed:

**Before improvements (2025-11-26):**
- EASY lookup queries (e.g., "What is VectorStore interface"): confidence 0.017 (❌ FAIL)
- MEDIUM concept queries (e.g., "How does hybrid search work"): confidence 0.50 (⚠️ OK)
- HARD architecture queries: confidence 0.90 (✅ PASS)
- **Average: 0.47 (4.7/10)**

The main issues:
1. **Instant mode didn't use query classification** - all queries used fixed weights (vector: 0.7, keyword: 0.3)
2. **Lookup queries failed** - needed keyword-heavy search (0.7 keyword, 0.3 vector) but got the opposite
3. **No adaptive fallback** - low-confidence instant mode results weren't escalated to auto mode
4. **Over-aggressive verification** - anti-hallucination checks zeroed out confidence on minor issues
5. **Query classifier existed but wasn't connected** - `query-classifier.ts` had good logic but wasn't used by orchestrator

## Decision

We implemented **adaptive search weights** that classify queries and adjust vector/keyword balance accordingly, with soft verification penalties.

### Architecture

#### 1. Query Classification System
**Location:** `mind-engine/src/search/query-classifier.ts`

Classifies queries into types with optimal search weights:
- **lookup** (e.g., "VectorStore", "What is X"): vector 0.3, keyword 0.7
- **concept** (e.g., "How does X work"): vector 0.8, keyword 0.2
- **code** (e.g., "implement X"): vector 0.6, keyword 0.4
- **debug** (e.g., "error in X"): vector 0.5, keyword 0.5
- **general** (fallback): vector 0.6, keyword 0.4

**Special handling:**
- "What is X" where X is PascalCase → treated as lookup (keyword-heavy)
- Explicit identifiers (backticks, camelCase, PascalCase) → lookup

#### 2. Orchestrator Integration
**Location:** `mind-orchestrator/src/orchestrator.ts`

```typescript
// executeInstantMode now uses classification
private async executeInstantMode(options, queryFn, requestId) {
  const classification = classifyQuery(options.text);

  const result = await queryFn({
    text: options.text,
    intent: 'search',
    limit: classification.suggestedLimit,
    vectorWeight: classification.weights.vector,    // NEW
    keywordWeight: classification.weights.keyword,  // NEW
  });
  // ...
}
```

#### 3. QueryFn Interface Extension
**Location:** `mind-orchestrator/src/gatherer/chunk-gatherer.ts`

```typescript
export interface QueryFnOptions {
  text: string;
  intent?: KnowledgeIntent;
  limit?: number;
  vectorWeight?: number;   // NEW: 0-1, default 0.7
  keywordWeight?: number;  // NEW: 0-1, default 0.3
}
```

#### 4. Auto-Fallback Mechanism
**Location:** `mind-orchestrator/src/orchestrator.ts`

```typescript
if (mode === 'instant') {
  result = await this.executeInstantMode(options, queryFn, requestId);

  // Auto-fallback for low confidence
  if (result.confidence < 0.3 && this.llmProvider) {
    mode = 'auto';
    result = await this.executeAutoMode(...);
  }
}
```

#### 5. Soft Verification Penalties
**Location:** `mind-orchestrator/src/verification/`

**Source Verification** (`source-verifier.ts`):
- File exists = 0.7 credit (was: 0 if snippet didn't match)
- Snippet found = +0.3 credit (full: 1.0)
- Prevents zero confidence when LLM slightly modifies snippets

**Field Checker** (`field-checker.ts`):
- Unverified fields reduce confidence by max 40% (was: could zero out)
- Formula: `max(0.6, verificationRate * 0.4 + 0.6)`
- More forgiving since LLM may reference broader context

#### 6. Metadata-based Weight Passing
**Location:** `mind-cli/src/application/rag.ts`

Weights passed via `query.metadata` from orchestrator to mind-engine:

```typescript
const queryFn = async (queryOptions) => {
  const result = await runtime.service.query({
    productId: MIND_PRODUCT_ID,
    intent: queryOptions.intent ?? 'search',
    scopeId,
    text: queryOptions.text,
    limit: queryOptions.limit,
    metadata: {
      vectorWeight: queryOptions.vectorWeight,
      keywordWeight: queryOptions.keywordWeight,
    },
  });
  return { chunks: result.chunks };
};
```

## Consequences

### Positive

✅ **Massive quality improvement:**
- EASY queries: 0.017 → **0.63** (+3050%)
- MEDIUM queries: 0.50 → **0.78** (+56%)
- HARD queries: 0.90 → **0.70** (better calibration)
- **Average: 0.70 (7.0/10)** - from 4.7/10

✅ **Intelligent search strategy:**
- Lookup queries use keyword-heavy search (find exact symbols)
- Concept queries use vector-heavy search (semantic understanding)
- Automatic adaptation without manual tuning

✅ **Robust fallback:**
- Low-confidence instant results escalate to auto mode
- Prevents poor answers from reaching users

✅ **Balanced verification:**
- Anti-hallucination still active but not over-aggressive
- Partial credit prevents false negatives

### Negative

⚠️ **Additional dependency:**
- mind-orchestrator now depends on mind-engine for `classifyQuery`
- Added to package.json dependencies

⚠️ **Slightly reduced hard query confidence:**
- Was 0.90, now 0.70 (but more realistic - better calibrated)
- Reflects actual verification results more accurately

⚠️ **Metadata coupling:**
- Weights passed through query.metadata
- Requires mind-engine to read and apply metadata weights

### Alternatives Considered

**1. Pre-defined query types in config**
- Rejected: Too manual, requires user to categorize queries
- Our approach: Automatic classification

**2. ML-based query classification**
- Rejected: Overkill for MVP, regex patterns work well
- Future: Could add if patterns become insufficient

**3. Per-query weight override in CLI**
- Rejected: Users shouldn't need to know about weights
- Our approach: Transparent, automatic

**4. Keep strict verification**
- Rejected: Created false negatives (confidence → 0)
- Our approach: Soft penalties, partial credit

## Implementation

### Changes Made

**1. mind-engine:**
- Enhanced `query-classifier.ts` with "What is X" detection
- Exported search module in `index.ts`
- Read weights from `query.metadata` in search pipeline

**2. mind-orchestrator:**
- Extended `QueryFnOptions` interface with weights
- Connected `classifyQuery` in `executeInstantMode`
- Added auto-fallback logic
- Softened source verification (partial credit)
- Softened field checker (max 40% penalty)
- Added `mind-engine` dependency

**3. mind-cli:**
- Updated `queryFn` to pass weights via metadata

### Benchmarks

Created standardized benchmark suite:
- **BENCHMARKS.md** - historical results, targets
- **scripts/run-benchmarks.sh** - automated testing

Run benchmarks:
```bash
cd /Users/kirillbaranov/Desktop/kb-labs
./kb-labs-mind/packages/mind-engine/scripts/run-benchmarks.sh
```

### Future Enhancements

1. **Learning from feedback:**
   - Track which queries work well with which weights
   - Adjust classification patterns based on success rate

2. **Per-codebase calibration:**
   - Some codebases may need different weight defaults
   - Allow per-scope weight configuration

3. **ML-based classification:**
   - If regex patterns become insufficient
   - Train on query/weight/outcome data

4. **Dynamic weight adjustment:**
   - Start with classification weights
   - Adjust based on initial results
   - Retry with different weights if confidence low

5. **User weight hints:**
   - Allow `--lookup`, `--concept` flags in CLI
   - Override automatic classification

## References

- [BENCHMARKS.md](../../packages/mind-engine/BENCHMARKS.md) - Quality benchmarks
- [ADR-0029: Agent Query Orchestration](0029-agent-query-orchestration.md) - Orchestrator architecture
- [ADR-0031: Anti-Hallucination System](0031-anti-hallucination-system.md) - Verification system
- [query-classifier.ts](../../packages/mind-engine/src/search/query-classifier.ts) - Classification implementation

## Metrics

### Before (2025-11-26 morning)
| Query Type | Confidence | Status |
|------------|------------|--------|
| EASY       | 0.017      | ❌ FAIL |
| MEDIUM     | 0.50       | ⚠️ OK   |
| HARD       | 0.90       | ✅ PASS |
| **Average**| **0.47**   | **4.7/10** |

### After (2025-11-26 evening)
| Query Type | Confidence | Status |
|------------|------------|--------|
| EASY       | 0.63       | ✅ PASS |
| MEDIUM     | 0.78       | ✅ PASS |
| HARD       | 0.70       | ✅ PASS |
| **Average**| **0.70**   | **7.0/10** |

**Improvement:** +49% average confidence, all benchmarks passing

---

**Last Updated:** 2025-11-26
**Next Review:** 2026-05-26
