# ADR-0031: Anti-Hallucination System

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** rag, quality, validation, llm, anti-hallucination

## Context

Mind RAG system uses LLM for query decomposition and answer synthesis. A critical issue is **LLM hallucinations** — when the model generates plausible but incorrect information:

1. **Phantom files**: Mentioning files that don't exist in the codebase
2. **Invented parameters**: Describing API fields not present in sources
3. **Misattributed code**: Quoting code from wrong files/locations
4. **Fabricated explanations**: Making up functionality that isn't implemented

### Impact

- ~20% of responses contained unverified claims (internal testing)
- Users lose trust when obvious hallucinations occur
- Debugging becomes harder with misleading information
- ADR/documentation queries especially prone to invention

### Constraints

- Must not significantly impact response latency
- Must work across all query modes (instant/auto/thinking)
- Must gracefully degrade when validation fails
- Cannot require re-indexing existing data

## Decision

Implement a multi-layer anti-hallucination system with:

1. **Source Verification Layer** — validate all source references
2. **Field Checker** — verify mentioned parameters exist in sources
3. **Grounded Prompts** — strict LLM instructions requiring citations
4. **Graceful Degradation** — mode fallback on validation failures
5. **Query Cache** — avoid regeneration for verified responses

### 1. Source Verification Layer

Every source reference in the response is validated:

```typescript
interface SourceVerification {
  // Verify source file exists in retrieved chunks
  verifySource(source: AgentSource): VerificationResult;

  // Check snippet actually exists in file content
  verifySnippet(file: string, snippet: string): boolean;

  // Validate line numbers are accurate
  verifyLines(file: string, startLine: number, endLine: number): boolean;
}

interface VerificationResult {
  exists: boolean;        // File was in retrieved chunks
  snippetValid: boolean;  // Snippet found in file content
  linesMatch: boolean;    // Line numbers accurate
  confidence: number;     // 0-1 validation confidence
}
```

Implementation:
- After LLM synthesis, extract all `AgentSource` objects
- For each source, check it exists in original chunks
- Verify snippet text appears in chunk content (fuzzy match for minor formatting)
- Flag phantom sources in response warnings

### 2. Field Checker

Extracts and verifies all technical terms mentioned in the answer:

```typescript
interface FieldChecker {
  // Extract field/parameter mentions from answer
  extractMentionedFields(answer: string): string[];

  // Verify each field exists in source content
  verifyFields(fields: string[], sources: SourceWithContent[]): FieldCheckResult;
}

interface FieldCheckResult {
  verified: string[];    // Fields found in sources
  unverified: string[];  // Potentially hallucinated fields
  confidence: number;    // verified.length / total
}

// Extraction patterns
const FIELD_PATTERNS = [
  /`(\w+)`/g,                              // `fieldName`
  /(\w+):\s*(?:string|number|boolean)/g,   // fieldName: type
  /(?:parameter|field|option)\s+(\w+)/gi,  // "parameter topK"
  /\.(\w+)\(/g,                            // method calls .doSomething(
];
```

When unverified fields detected:
1. Reduce response confidence by `(1 - verification.confidence)`
2. Add warning to response: `"Unverified fields: [list]"`
3. For thinking mode: optionally regenerate with stricter prompt

### 3. Grounded Prompts

LLM prompts explicitly require source citations:

```typescript
const GROUNDED_SYNTHESIS_PROMPT = `
You are a code documentation assistant. Answer ONLY using the provided sources.

CRITICAL RULES:
1. NEVER mention files, functions, or parameters NOT in provided sources
2. Every technical claim MUST have [source:N] reference
3. Quote exact code snippets, don't paraphrase or summarize code
4. If sources insufficient, say "Not found in provided sources"
5. When uncertain, prefer "may" over definitive statements

PROHIBITED:
- Inventing file paths
- Making up parameter names
- Describing functionality not shown in sources
- Adding information from training data

SOURCES:
{sources_with_indices}

QUERY: {query}

Answer with citations [source:N] for every claim:`;
```

### 4. Graceful Degradation

When validation detects issues:

```typescript
async function executeWithFallback(mode: AgentQueryMode): Promise<AgentResponse> {
  try {
    const response = await fullPipeline(mode);
    const validation = await validateResponse(response);

    if (validation.confidence < 0.5) {
      // Try simpler mode with stricter grounding
      if (mode === 'thinking') return executeWithFallback('auto');
      if (mode === 'auto') return executeWithFallback('instant');
    }

    return response;
  } catch (error) {
    // Return partial results rather than failure
    return {
      answer: null,
      sources: gatheredChunks,
      confidence: 0,
      complete: false,
      warnings: [{ type: 'PIPELINE_ERROR', message: error.message }]
    };
  }
}
```

Fallback chain: `thinking` → `auto` → `instant` → raw sources

### 5. Query Cache with Validation

Cache only validated, high-confidence responses:

```typescript
class QueryCache {
  set(key: string, response: AgentResponse): void {
    // Only cache responses that passed validation
    if (response.confidence < 0.3) return;
    if (response.warnings?.some(w => w.type === 'UNVERIFIED_FIELDS')) return;

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      validatedAt: Date.now()
    });
  }
}
```

TTL by mode:
- `instant`: 2 minutes (fast, simple queries)
- `auto`: 5 minutes (standard)
- `thinking`: 15 minutes (complex, expensive)

### Response Structure Updates

```typescript
interface AgentResponse {
  answer: string;
  sources: AgentSource[];
  confidence: number;
  complete: boolean;

  // NEW: Validation warnings
  warnings?: Array<{
    type: 'PHANTOM_FILE' | 'SNIPPET_MISMATCH' | 'UNVERIFIED_FIELDS' | 'STALE_INDEX';
    message: string;
    details?: Record<string, unknown>;
  }>;

  // NEW: Validation metadata
  validation?: {
    sourcesVerified: number;
    sourcesTotal: number;
    fieldsVerified: number;
    fieldsTotal: number;
    confidence: number;
  };
}
```

## Consequences

### Positive

- **Hallucination rate**: ~20% → <5%
- **Trust**: Every claim backed by verifiable source
- **Transparency**: Users see validation status and warnings
- **Reliability**: Graceful degradation instead of false confidence
- **Efficiency**: Cache prevents repeated LLM calls for same queries

### Negative

- **Latency**: +50-100ms for validation (acceptable)
- **Complexity**: More pipeline stages to maintain
- **False negatives**: Some valid responses may be flagged due to fuzzy matching
- **Strictness**: May reduce "creative" explanations (intentional)

### Alternatives Considered

1. **Pre-flight LLM verification**: Ask LLM to self-check
   - Rejected: LLMs are poor at detecting own hallucinations

2. **Embedding-based validation**: Check answer embedding similarity to sources
   - Rejected: Too coarse, doesn't catch specific field errors

3. **User feedback only**: Let users report hallucinations
   - Rejected: Reactive not preventive, damages trust first

4. **RAG without synthesis**: Return only raw chunks
   - Rejected: Poor UX, defeats purpose of RAG assistant

## Implementation

### Files Modified/Created

| File | Changes |
|------|---------|
| `mind-orchestrator/src/validation/source-verifier.ts` | **NEW** — Source verification logic |
| `mind-orchestrator/src/validation/field-checker.ts` | **NEW** — Field extraction and verification |
| `mind-orchestrator/src/validation/index.ts` | **NEW** — Validation module exports |
| `mind-orchestrator/src/components/synthesizer.ts` | Grounded prompts, validation integration |
| `mind-orchestrator/src/pipeline/error-handler.ts` | **NEW** — Graceful degradation |
| `mind-orchestrator/src/cache/query-cache.ts` | **NEW** — LRU cache with validation checks |
| `knowledge-contracts/src/agent-response.ts` | Add `warnings` and `validation` fields |

### Implementation Phases

**Phase 1: Source Verification (Completed)**
- Source verifier with file/snippet checks
- Integration with synthesis pipeline

**Phase 2: Field Checker (Completed)**
- Field extraction patterns
- Verification against source content
- Warning generation

**Phase 3: Grounded Prompts (Completed)**
- Updated synthesis prompts
- Source categorization (ADR/code/docs)
- Structured output with citations

**Phase 4: Graceful Degradation (Completed)**
- Mode fallback logic
- Partial results on failure
- Error tracking

**Phase 5: Query Cache (Completed)**
- LRU cache implementation
- Validation-aware caching
- Scope invalidation

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Hallucination rate | ~20% | <5% |
| Source grounding | Partial | 100% with [source:N] |
| Field verification | None | All fields checked |
| Response confidence accuracy | Low | High (validated) |
| Cache hit rate | N/A | ~30% for repeated queries |

## References

- [ADR-0029: Agent Query Orchestration](./0029-agent-query-orchestration.md)
- [ADR-0030: Mind Analytics Integration](./0030-mind-analytics-integration.md)
- [Source Verifier Implementation](../../packages/mind-orchestrator/src/validation/source-verifier.ts)
- [Field Checker Implementation](../../packages/mind-orchestrator/src/validation/field-checker.ts)
- [Query Cache Implementation](../../packages/mind-orchestrator/src/cache/query-cache.ts)

---

**Last Updated:** 2025-11-26
