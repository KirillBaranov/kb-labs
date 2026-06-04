# @kb-labs/mind-core

The engine for the KB Labs **Mind** (RAG) plugin — all retrieval/answer logic
behind a single `createMind(services, config)` facade that the CLI and REST
handlers call identically.

## Verbs

`index` · `search` · `ask` · `explore` · `reindex` · `sync{Add,Update,Delete,List,Status}` · `status` · `health`

## Pipeline

- **Ingest** — discover (adaptive, language-agnostic) → chunk (AST-aware) →
  token-budget embed → upsert + manifest. Incremental via per-file hash delta.
- **Retrieve** — hybrid BM25 + vector fused with intent-adaptive RRF; per-result
  provenance (`matchedBy: lexical|semantic|both`) and freshness (`stale`).
  Optional HyDE (vector-side) and query expansion (lexical-side), both flagged.
- **Answer** — verify/confidence + field-check (anti-hallucination); `ask`
  synthesizes a grounded answer, `explore` returns a task-orientation file map.

## Boundary

Imports only `@kb-labs/sdk` (+ `@kb-labs/mind-contracts`). Platform adapters
(LLM, embeddings, vector store, storage, cache) arrive via injected
`MindServices` — never imported directly.
