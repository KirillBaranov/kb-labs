import path from 'node:path'
import { test, expect } from '@playwright/test'
import {
  BENCH_ENABLED,
  BENCH_INDEX,
  BENCH_SCOPE,
  DEGRADED_INDEX,
  DEGRADED_SCOPE,
  REPO_ROOT,
  ensureBenchIndex,
  loadCorpus,
  runHeadToHead,
  type HeadToHead,
} from '../../../lib/bench.js'
import { writeDegradedCorpus } from '../../../lib/degrade.js'

/**
 * M-BENCH-05: grep-vs-mind head-to-head — the thesis proof.
 *
 * Mind's value ∝ codebase size × messiness × (1 / doc quality). On a clean,
 * well-named/-documented corpus, a literal grep already finds the right files,
 * so Mind ≈ grep. Strip the documentation (comments/JSDoc) → grep loses the
 * natural-language vocabulary, but Mind's vector side still embeds the code →
 * Mind pulls ahead. We measure both and assert the edge does NOT shrink on the
 * degraded corpus (and log the full numbers as the real evidence).
 */
test.describe('mind real-embedder bench — grep-vs-mind head-to-head', () => {
  test.skip(!BENCH_ENABLED, 'set MIND_BENCH_REAL=1 and run with kb-dev up (needs OpenAI + Qdrant)')

  test('M-BENCH-05: Mind’s edge over grep holds/grows on a degraded (undocumented) corpus', async ({
    request,
  }) => {
    // ── clean corpus ─────────────────────────────────────────────────────────
    await ensureBenchIndex(request, { indexId: BENCH_INDEX, scope: BENCH_SCOPE })
    const clean = await runHeadToHead(request, BENCH_INDEX, loadCorpus(BENCH_SCOPE), 'clean')

    // ── degraded corpus: comment-stripped copy, indexed fresh ─────────────────
    const written = writeDegradedCorpus(
      path.join(REPO_ROOT, BENCH_SCOPE),
      path.join(REPO_ROOT, DEGRADED_SCOPE),
    )
    expect(written, 'degraded corpus should mirror the source files').toBeGreaterThan(0)
    await ensureBenchIndex(request, { indexId: DEGRADED_INDEX, scope: DEGRADED_SCOPE })
    const degraded = await runHeadToHead(request, DEGRADED_INDEX, loadCorpus(DEGRADED_SCOPE), 'degraded')

    const line = (h: HeadToHead): string =>
      `mind=${h.mindHit5.toFixed(3)} grep=${h.grepHit5.toFixed(3)} ` +
      `delta=${h.delta.toFixed(3)} semWin=${h.semanticWinRate.toFixed(3)}`
    console.log(`[mind-bench/h2h] clean    — ${line(clean)}`)
    console.log(`[mind-bench/h2h] degraded — ${line(degraded)}`)
    console.log(
      `[mind-bench/h2h] Δedge (degraded−clean) = ${(degraded.delta - clean.delta).toFixed(3)} ` +
        `| ΔsemWin = ${(degraded.semanticWinRate - clean.semanticWinRate).toFixed(3)}`,
    )
    for (const q of degraded.perQuery) {
      const c = clean.perQuery.find((p) => p.id === q.id)
      if (q.mindHit !== q.grepHit || c?.mindHit !== c?.grepHit) {
        console.log(
          `  ${q.id}: clean[mind=${c?.mindHit} grep=${c?.grepHit}] degraded[mind=${q.mindHit} grep=${q.grepHit}]`,
        )
      }
    }

    // Mind must not be WORSE than grep on the degraded corpus (the case it exists for).
    const TOL = 0.05
    expect(
      degraded.mindHit5,
      'Mind hit@5 fell below grep on the degraded corpus',
    ).toBeGreaterThanOrEqual(degraded.grepHit5 - TOL)

    // The thesis: Mind's edge over grep should hold or grow once docs are stripped.
    expect(
      degraded.delta,
      'Mind’s edge over grep shrank on the degraded corpus (thesis not supported on this corpus)',
    ).toBeGreaterThanOrEqual(clean.delta - TOL)
  })
})
