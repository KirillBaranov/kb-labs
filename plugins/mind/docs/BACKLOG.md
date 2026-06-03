# Mind v2 — Gap Backlog

Feature parity backlog vs the legacy engine. **Policy: every port lands only behind a benchmark A/B that proves it doesn't regress quality** (better/worse on the golden set). No "vibe" merges.

Legend — Status: ✅ parity · 🟡 lite · ❌ missing · 🔵 new-in-v2
Bench-gated: every row marked **Y** must ship with a before/after benchmark delta.

## Retrieval quality

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Hybrid BM25 + vector + RRF (intent-adaptive) | full | ✅ | — | — | parity |
| Reranking | BM25/vector-norm + context expansion | 🟡 heuristic (coverage + verbatim) | P1 | Y | add LLM-rerank + context expansion behind A/B. **Path/filename-match boost TRIED → rejected**: live bench regressed (mrr 0.515→0.500, hit@5 0.615→0.538) — generic query tokens hit generic path parts and pulled wrong files up. Reverted. |
| Semantic dedup | embedding-cosine | 🟡 token-Jaccard | P2 | Y | swap to embedding-cosine, measure dup-rate vs recall |
| AST chunking | tree-sitter | 🟡 structure-aware-lite (brace) | P2 | Y | tree-sitter behind `chunkFile`; measure chunk-boundary quality |
| Freshness / staleness | fresh/soft/hard + penalties | ❌ | P1 | Y | confidence penalty for stale chunks |
| Conflict detection | cross-source contradiction penalty | ❌ | P3 | Y | hard to bench — needs conflict fixtures |
| HyDE (hypothetical embeddings) | optional | 🟡 ported, default OFF | P3 | Y | `retrieval.hyde` flag + `e2e/mind` `hyde-on` A/B. Earlier verdict on the 6-query golden set: **neutral** (Δmrr 0.000, Δhit@5 0.000) — too few concept queries to exercise HyDE. Golden set since extended to **27 queries (concept-heavy)** (Stage 3); re-run pending for an honest verdict. Stays OFF until a lift is shown. |
| Query expansion (lexical-side) | n/a | 🔵 new, default OFF | P2 | Y | `retrieval.expand` flag + `core/src/retrieval/expand.ts` + `e2e/mind` `expand-on` A/B. Appends LLM-suggested related identifiers/synonyms to the BM25 query (orthogonal to HyDE on the vector side) — targets vocabulary mismatch, the core messy-repo failure. Verdict pending the live A/B on the extended golden set; ships on-by-default only on a lift without regression. |

## Answer quality

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Anti-hallucination source-verify (0.7 file + 0.3 snippet) | full | ✅ | — | — | parity |
| Confidence floor + warnings | full | ✅ | — | — | parity |
| Field-checker (answer-mentioned symbols exist in chunks) | full | ✅ restored | P1 | Y | `answer/field-check.ts` — extracts code symbols from the answer, grounds each against chunk text+path, folds the grounded fraction into the confidence stack + emits `UNGROUNDED_TERMS` warning. Applied in LLM modes. |
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
| **Real embedder profile (OpenAI/local)** | toy embedder shows `neutral` for semantic features — can't judge HyDE/rerank/dedup quality | **P0** | ✅ **live `e2e/mind` domain** — golden set vs live REST on OpenAI+Qdrant; A/B via scenario overlays (rerank ON vs OFF); gated `MIND_BENCH_REAL=1` |
| Larger graded golden set (50+ queries, real repo slice) | 14 queries → coarse deltas | P1 | 🟡 grew 8→14 |
| Groundedness metric (LLM-judge answer vs sources) | gate answer-quality features (field-check, compression) | P1 | ❌ |
| Tokens/query tracking | gate decompose/thinking cost | P2 | ❌ |

> **Rule of thumb for porting:** pick a P1 row → add the feature behind a config flag → run bench A/B (ON vs OFF). For **semantic** features (rerank/dedup/HyDE/chunking) the toy embedder is `neutral`, so gate them on the **real-embedder profile** — the `e2e/mind` domain (`MIND_BENCH_REAL=1`, scenario overlay disables the feature + restarts `rest`, spec asserts ON ≥ OFF). For non-semantic features keep using the in-process deterministic harness. Keep the port only if the gated metric improves (or holds) without regressing others; update `baseline.json` deliberately.
