# Mind v2 — Gap Backlog

Feature parity backlog vs the legacy engine. **Policy: every port lands only behind a benchmark A/B that proves it doesn't regress quality** (better/worse on the golden set). No "vibe" merges.

Legend — Status: ✅ parity · 🟡 lite · ❌ missing · 🔵 new-in-v2
Bench-gated: every row marked **Y** must ship with a before/after benchmark delta.

## Retrieval quality

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Hybrid BM25 + vector + RRF (intent-adaptive) | full | ✅ | — | — | parity |
| Reranking | BM25/vector-norm + context expansion | 🟡 heuristic (coverage + verbatim) | P1 | Y | add LLM-rerank + context expansion behind A/B |
| Semantic dedup | embedding-cosine | 🟡 token-Jaccard | P2 | Y | swap to embedding-cosine, measure dup-rate vs recall |
| AST chunking | tree-sitter | 🟡 structure-aware-lite (brace) | P2 | Y | tree-sitter behind `chunkFile`; measure chunk-boundary quality |
| Freshness / staleness | fresh/soft/hard + penalties | ❌ | P1 | Y | confidence penalty for stale chunks |
| Conflict detection | cross-source contradiction penalty | ❌ | P3 | Y | hard to bench — needs conflict fixtures |
| HyDE (hypothetical embeddings) | optional | ❌ | P3 | Y | only if bench shows lift on concept queries |

## Answer quality

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Anti-hallucination source-verify (0.7 file + 0.3 snippet) | full | ✅ | — | — | parity |
| Confidence floor + warnings | full | ✅ | — | — | parity |
| Field-checker (answer-mentioned symbols exist in chunks) | full | ❌ | P1 | Y | strong anti-hallucination signal; bench groundedness |
| Token-budget compression (truncate/summarize/smart) | full | 🟡 snippet truncation only | P2 | Y | measure answer quality vs token cost |
| Query decomposition | LLM + parallel | ✅ (single pass) | — | — | parity-ish |
| Complexity auto-detection (auto-mode decides to decompose) | full | ❌ | P2 | Y | bench latency vs quality tradeoff |
| Iterative completeness + retry (thinking) | up to 3 iters | ❌ | P2 | Y | bench thinking-mode completeness |
| Cross-reference (thinking) | full | ❌ | P3 | Y | |

## Learning / feedback

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Query-history recording | full | ✅ (records) | — | — | parity |
| Adaptive learning loop (feedback → ranking weights) | full | ❌ (not wired into ranking) | P3 | Y | needs longitudinal bench, not single-shot |

## Indexing / ops

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| git-diff delta indexing | full | ❌ (`index` = full rebuild; sync = explicit paths) | P1 | N | correctness/perf, not retrieval quality |
| Metadata indexers (API exports, dep graph, package.json, ADR) | full | ❌ (kind-by-extension only) | P2 | Y | richer metadata may lift doc-fact queries |
| sqlite-vec backend (Doc-MCP) | n/a | ❌ | P1 | N | required for hosted Doc-MCP; infra not quality |
| Vector backends (Qdrant / memory) | Qdrant/memory/file | ✅ via platform adapter | — | — | namespace-isolated (Phase P) |

## Stabilization (must work before porting features)

| Item | Status | Priority | Notes |
|---|---|---|---|
| Live `kb mind …` CLI surfacing | ❌ command-tree drops `mind` group | **P0** | deterministic exclusion under investigation; blocks live use |
| Studio pages (search console / eval dashboard) | ❌ deferred | P3 | additive UI |
| REST live smoke (kb-dev + curl) | ⏳ untested | P1 | needs configured adapters |

## Benchmark harness — must be high-quality to gate ports

Current: deterministic test embedder, 4 corpora, **14 golden queries** (12 + 2 abstain), recall/precision/MRR/nDCG/hit/abstain + **per-group breakdown** + **latency p50/p95** + **A/B compare** (`compareAB`) + regression gate. Tests: `core/tests/benchmarks/{eval,ab}.spec.ts`.

| Upgrade | Why | Priority | Status |
|---|---|---|---|
| A/B mode: feature ON vs OFF → metric delta + verdict | the "better/worse" gate the policy requires | P0 | ✅ `compareAB` (detects deliberate regressions) |
| Per-group breakdown | catch "fixed code, broke docs" | P1 | ✅ `report.byGroup` |
| Latency p50/p95 | gate cost-affecting features | P2 | ✅ in `Metrics` |
| Config-toggleable stages (rerank/dedup) for A/B | so features can be flipped ON/OFF | P0 | ✅ `retrieval.rerank`/`dedup` |
| **Real embedder profile (OpenAI/local) via `makeServices`** | toy embedder shows `neutral` for semantic features (rerank A/B = neutral today) — can't judge HyDE/rerank/dedup quality | **P0** | 🟡 seam ready (`BenchOptions.makeServices`), profile not wired |
| Larger graded golden set (50+ queries, real repo slice) | 14 queries → coarse deltas | P1 | 🟡 grew 8→14 |
| Groundedness metric (LLM-judge answer vs sources) | gate answer-quality features (field-check, compression) | P1 | ❌ |
| Tokens/query tracking | gate decompose/thinking cost | P2 | ❌ |

> **Rule of thumb for porting:** pick a P1 row → add the feature behind a config flag → run bench A/B (ON vs OFF) on the real-embedder profile → keep only if the gated metric improves without regressing others → update `baseline.json` deliberately.
