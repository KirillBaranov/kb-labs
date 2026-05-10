# ADR-0047: RAG Agent Query Accuracy Improvements

**Date:** 2026-05-10
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-10
**Tags:** [retrieval, ranking, embeddings, synthesis, agent]

## Context

`kb mind rag-query --agent` is used as the primary context-gathering tool for Claude Code, replacing full agents on the Pro plan. Testing against 4 real queries revealed systematic accuracy problems:

1. ADR chunks beat actual code for specific-file queries (`architectureQuery` regex matched `how\s+does` unconditionally, giving ADRs a ×1.14 boost regardless of query intent).
2. `buildDirectAnswer()` fallback returned bare file paths with no content — useless for an agent consuming the result as context.
3. The synthesis LLM received no signal distinguishing ADR sources (architectural intent) from code sources (current implementation), producing confidence 1.0 answers backed only by ADRs.
4. `text-embedding-3-small` is NL-focused: "crash propagation" does not match `uncaughtException`, "manifest discovery" does not match `discoverCLIPackages`. Code identifier vocabulary is absent from embeddings.
5. Tree-sitter chunker already extracts `name` and `type` (function/class/interface) per chunk via AST, but `buildChunkMetadata()` did not forward these fields into `MindChunk.metadata`, so they were silently dropped.
6. Merging subquery results without score normalization allows a subquery with uniformly high scores to dominate the merged set regardless of its actual precision.

## Decision

### Phase 1 — Reranker and synthesis fixes

**Conditioned ADR scoring** (`chunk-gatherer.ts`): introduce two query intent signals computed before scoring — `isSpecificFileQuery` (a concrete filename like `governed.ts` appears in the query) and `designIntentQuery` (query contains "why", "design decision", "tradeoff" without a specific file). ADR scoring becomes:
- `isSpecificFileQuery = true` → ADR penalty ×0.6 (implementation query; ADR is not authoritative)
- `isSpecificFileQuery = false`, conceptual query → ADR boost ×1.14 (unchanged behavior)
- `designIntentQuery = true` → additional ADR boost ×1.14

Filename extraction added to `extractTechnicalIdentifiers()` so `governed.ts` is recognized as a technical identifier and its chunk receives the identifier-match boost.

**buildDirectAnswer with code content** (`response-synthesizer.ts`): the LLM fallback now includes the first 15 lines of the top chunk in a code block, plus a list of other relevant file locations.

**SOURCE TYPE RULES in synthesis prompt** (`prompts.ts`): the `SYNTHESIS_PROMPT_TEMPLATE` now instructs the LLM to mark claims from `/docs/adr/` paths as "(architectural intent — verify against code)", treat `.ts`/`.go` sources as authoritative for implementation questions, and cap confidence at 0.45 when the primary evidence is ADR-only.

**Decomposer prompt** (`prompts.ts`): rewritten stack-neutral. Rules: always include at least one exact-lookup subquery with real code identifiers; split by architectural layer; use code vocabulary (`uncaughtException`, not "crashes"); 2–4 subqueries each targeting a distinct file or concept.

### Phase 2 — Embedding enrichment, retrieval pipeline, HyDE

**AST symbol propagation** (`parallel-chunking.ts`): `buildChunkMetadata()` gains `symbolName?: string` and `symbolType?: string` parameters. The call site passes `sourceChunk.name` and `sourceChunk.type` from the Tree-sitter chunker. Mapping:

| `symbolType`                  | metadata key   |
|-------------------------------|----------------|
| `function`, `arrow`, `method` | `functionName` |
| `class`                       | `className`    |
| `interface`, `type`           | `typeName`     |
| other                         | `symbolName`   |

**Embedding enrichment** (`embedding.ts`): `enrichForEmbedding(chunk, sanitizedText)` appends `\n[Symbol: <name>]` to the text sent to the embedding model. The stored `chunk.text` is not modified — enrichment affects only the vector representation. Source: `metadata.functionName ?? metadata.className ?? metadata.typeName ?? metadata.symbolName`. Chunkers without AST names return text unchanged. Requires re-index to apply to existing data.

**Doc freshness annotation** (`response-synthesizer.ts`): `annotateChunkText()` prepends `[⚠ Documentation · last updated: YYYY-MM-DD]` to doc/ADR chunks in the TOON table sent to the LLM. Date is derived from `chunk.metadata.fileMtime`. Code chunks are not annotated. Gives the LLM an explicit signal about source recency and nature.

**Subquery deduplication** (`chunk-gatherer.ts`): `deduplicateSubqueries()` removes near-duplicate subqueries before retrieval using Jaccard token overlap. Threshold: 0.7. Prevents wasted retrieval budget when the decomposer generates overlapping queries.

**Score normalization per subquery** (`chunk-gatherer.ts`): `normalizeSubqueryScores()` normalizes scores within each subquery result to [0, 1] before merging. Guard: skipped when `maxScore < 0.5` to avoid elevating a weak subquery to the same weight as a strong one.

**Cross-subquery occurrence boost** (`chunk-gatherer.ts`): `applyMultiSubqueryBoost()` increases the score of chunks whose file path appears in multiple subquery result sets (×1.10 for 2 subqueries, ×1.20 for 3+). A file confirmed by independent BM25 and vector subqueries is a strong relevance signal.

**Min score filter** (`chunk-gatherer.ts`): chunks with `score < 0.25` are dropped after deduplication and occurrence boost, before rerank. Removes low-signal noise (stale docs, off-topic ADRs, generic configs) that pulls down synthesizer confidence. Fallback: if all chunks are filtered, return top-5 unfiltered.

**HyDE — Hypothetical Document Embeddings** (`hyde.ts`, `chunk-gatherer.ts`): for technical lookup subqueries (`keyword weight > 0.5`), generate a short realistic code snippet via LLM and use it as the query text instead of the NL query. A code embedding is semantically closer to the indexed code than a natural-language description. Controlled by `OrchestratorConfig.hyde.enabled` (default: `false`). Falls back to original query text on LLM error or empty output. `ChunkGathererOptions` gains an optional `llm?: ILLM` field.

## Consequences

### Positive

- Specific-file queries correctly prioritize code over ADR; design-intent queries still surface ADRs.
- LLM fallback answers contain actionable code for the consuming agent.
- Synthesis LLM correctly downgrades confidence for ADR-primary answers.
- AST-derived symbol names bridge the vocabulary gap between NL queries and code identifiers without changing the embedding model.
- Agent sees documentation recency and can reason about drift risk.
- Duplicate subqueries eliminated before they consume retrieval capacity.
- No single strong subquery dominates the merged result set.
- Files confirmed by multiple independent subqueries are ranked higher.
- Low-signal chunks do not suppress synthesizer confidence.

### Negative

- HyDE adds one LLM call per technical subquery (~500 ms in auto mode with 2–4 subqueries). Mitigated by feature flag.
- HyDE may generate non-existent identifiers, sending the embedding in the wrong direction. Mitigated by `temperature: 0.1` and fallback to original query.
- Score normalization removes the absolute quality signal of a subquery. Mitigated by the `maxScore ≥ 0.5` guard.
- MIN_SCORE = 0.25 may drop legitimate chunks for niche queries. Mitigated by the top-5 fallback.
- Embedding enrichment requires a full re-index to apply to existing indexed data.

### Alternatives Considered

- **Regex-based symbol extraction in embedding stage**: rejected. Tree-sitter already extracts symbol names via AST at chunk time. Re-parsing chunk text with regex produces false positives on function call sites. The correct approach is to propagate AST-derived data through the existing metadata pipeline.
- **Replacing the embedding model** (Voyage code-2, text-embedding-3-large): valid and expected to yield a larger improvement on the vocabulary gap. Deferred — requires a new adapter, full re-index, and benchmark validation. Implemented separately.
- **Cross-encoder reranker** (Cohere Rerank, FlashRank): deferred. Adds latency and an external dependency. Viable when an inference server is available.
- **Adjacent chunk retrieval**: fetch neighboring chunks from the same file for high-confidence results. Deferred — requires file access at query time and adds complexity.
- **Unconditional ADR boost** (previous behavior): rejected. ×1.14 without query intent discrimination systematically surfaces architectural intent over implementation for any "how does X work" query.

## Implementation

Changed packages:

- `@kb-labs/mind-engine` — `parallel-chunking.ts`, `embedding.ts`
- `@kb-labs/mind-orchestrator` — `chunk-gatherer.ts`, `hyde.ts`, `response-synthesizer.ts`, `prompts.ts`, `types.ts`, `orchestrator.ts`

Phase 1 changes and Phase 2 retrieval/synthesis changes apply to the existing index immediately. Embedding enrichment (Phase 2, step 2) requires re-indexing:

```bash
pnpm kb mind rag-index
```

HyDE is opt-in via orchestrator config:

```json
{ "hyde": { "enabled": true } }
```

## References

- [ADR-0020: AST-Based Chunking](./0020-ast-based-chunking.md)
- [ADR-0029: Agent Query Orchestration](./0029-agent-query-orchestration.md)
- [ADR-0031: Anti-Hallucination System](./0031-anti-hallucination-system.md)
- [ADR-0033: Adaptive Search Weights](./0033-adaptive-search-weights.md)
- [ADR-0035: Orchestrator Performance Optimizations](./0035-orchestrator-performance-optimizations.md)
- [ADR-0045: Benchmark-Driven Quality Gate](./0045-benchmark-driven-quality-gate.md)

---

**Last Updated:** 2026-05-10
**Next Review:** 2026-08-10
