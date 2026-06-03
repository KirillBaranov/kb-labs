# Mind v2 — Gap Backlog

Feature parity backlog vs the legacy engine. **Policy: every port lands only behind a benchmark A/B that proves it doesn't regress quality** (better/worse on the golden set). No "vibe" merges.

Legend — Status: ✅ parity · 🟡 lite · ❌ missing · 🔵 new-in-v2
Bench-gated: every row marked **Y** must ship with a before/after benchmark delta.

## Retrieval quality

| Feature | Legacy | v2 status | Priority | Bench-gated | Notes |
|---|---|---|---|---|---|
| Hybrid BM25 + vector + RRF (intent-adaptive) | full | ✅ | — | — | parity. **Was silently BM25-only until 2026-06-03** — a vector-store id round-trip bug (qdrant UUID hash + governance `mind:` prefix never stripped on read) dropped every vector hit. Fixed in `2d3405cb` (adapter + plugin-runtime wrapper, both with regression tests). Vector side now contributes (`matchedBy` both/semantic, `semWin>0`). |
| **Adaptive file discovery** | n/a | ✅ new | — | — | `core/src/ingest/discover.ts` indexes any text source (binary/asset/lockfile denylist + NUL sniff) instead of a hardcoded extension allowlist — a Vue+C# repo now indexes its `.cs`/`.vue`. `83d62890`. |
| Reranking | BM25/vector-norm + context expansion | 🟡 heuristic (coverage + verbatim) | P1 | Y | add LLM-rerank + context expansion behind A/B. **Path/filename-match boost TRIED → rejected**: live bench regressed (mrr 0.515→0.500, hit@5 0.615→0.538) — generic query tokens hit generic path parts and pulled wrong files up. Reverted. |
| Semantic dedup | embedding-cosine | 🟡 token-Jaccard | P2 | Y | swap to embedding-cosine, measure dup-rate vs recall |
| AST chunking | tree-sitter | 🟡 structure-aware-lite (brace) | P2 | Y | tree-sitter behind `chunkFile`; measure chunk-boundary quality |
| Freshness / staleness | fresh/soft/hard + penalties | ❌ | P1 | Y | confidence penalty for stale chunks |
| Conflict detection | cross-source contradiction penalty | ❌ | P3 | Y | hard to bench — needs conflict fixtures |
| HyDE (hypothetical embeddings) | optional | 🟡 ported, default OFF | P3 | Y | `retrieval.hyde` flag + `e2e/mind` `hyde-on` A/B. Concept golden extended to **27 queries** (Stage 3). Verdict **PENDING a standard-runner pass**: the earlier "identical metrics" reading (2026-06-03) was an artifact of a non-standard manual harness — daemons started by hand that `kb-dev ensure --scenario` could not restart with the overlay, so all scenarios ran the unchanged config. The overlay mechanism itself is fine in the standard `kb-labs-e2e-runner` flow (`rerank-off` A/B proves it). Re-run via `MIND_BENCH_REAL=1 kb-devkit run e2e --packages @kb-labs/e2e-mind` (runner owns kb-dev lifecycle). Baseline `semanticWinRate=0.000` on the clean corpus stands (BM25 already nails it; semantic levers should show value on a degraded/messy corpus). Stays OFF until a standard run shows a lift. |
| Query expansion (lexical-side) | n/a | 🔵 new, default OFF | P2 | Y | `retrieval.expand` flag + `core/src/retrieval/expand.ts` + `e2e/mind` `expand-on` A/B. Same as HyDE: verdict PENDING a standard-runner pass + ideally a degraded corpus. Stays OFF until a lift is shown. |

### Validation finding — grep-vs-mind head-to-head (2026-06-03)

`e2e/mind` `headtohead` scenario (`M-BENCH-05`), 27-query golden over the
`plugins/mind/core/src` corpus, hit@5 of Mind `/search` vs a literal grep
baseline on the same files; then a comment-stripped ("undocumented") copy:

| corpus | mind hit@5 | grep hit@5 | delta (mind−grep) | semWin |
|---|---|---|---|---|
| clean | 0.741 | 0.778 | **−0.037** | 0.000 |
| degraded (no comments) | 0.519 | 0.667 | **−0.148** | 0.000 |

**The thesis ("Mind beats grep on undocumented code") is NOT supported on this
corpus — the opposite held.** Two honest takeaways:

1. On a small, clean, well-named corpus, **literal grep is a strong baseline
   Mind doesn't beat** (grep already finds the file via identifiers + comments;
   `semWin=0.000` — zero semantic-only wins).
2. **Comment-stripping hurts Mind *more* than grep** (mind 0.741→0.519 vs grep
   0.778→0.667). Mind's vector side leans heavily on natural-language comments —
   they embed close to the NL query. So "strip the docs" removes *Mind's own*
   signal; it is the wrong degradation axis for the thesis.

> **⚠️ CORRECTION (2026-06-03, later same day): the numbers above were measured
> on BROKEN retrieval.** A vector-store id round-trip bug (commit `2d3405cb`)
> silently dropped every vector hit, so Mind was running
> **BM25-only** in all of the above — `semWin=0.000` was the symptom, not a
> property of the corpus. After the fix the picture inverts (see next finding).
> HyDE/expand "no effect" verdicts were likewise measured on BM25-only retrieval
> and must be re-run.

### Validation finding — grep-vs-mind on a real proprietary repo (2026-06-03, post-fix)

Head-to-head on **a private ~140-file C# domain module** (NDA — indexed in place
via `mind index --root`, nothing copied into this repo), 14 hand-built queries:
6 keyword-style (query reuses the file's naming) + 8 semantic (concept described
without the identifier word). hit@5, Mind `/search` vs a literal grep baseline.

| retrieval | mind hit@5 | grep hit@5 | delta (mind−grep) | semWin |
|---|---|---|---|---|
| **broken (BM25-only)** | 0.429 | 0.571 | −0.143 | 0.000 |
| **fixed (hybrid)** | **0.714** | 0.571 | **+0.143** | 0.281 |

Split (fixed): keyword mind 6/6 vs grep 5/6; **semantic mind 4/8 vs grep 3/8**,
including queries grep scored 0 on (semantic-only wins). With working hybrid
retrieval Mind **out-retrieves grep (+0.143)** on a real, less-documented
enterprise corpus, and `semWin=0.281` is concrete proof-of-value vs grep — the
thesis holds once the vector side actually contributes.

**Implication / next:** re-run the in-repo `headtohead` + HyDE/expand A/B on
fixed retrieval (the clean-corpus result may also move). The retrieval
correctness fix is the highest-impact change in this whole effort.

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
