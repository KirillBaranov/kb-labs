import { test, expect } from '@playwright/test'
import {
  BENCH_ENABLED,
  GATE,
  ensureBenchIndex,
  recordMetrics,
  resetLedger,
  runBench,
} from '../../../lib/bench.js'

/**
 * M-BENCH (default): real-embedder quality GATE.
 *
 * Index the corpus slice over the live engine, run the golden set against
 * `/search`, and assert the retrieval gate. With the real embedder this
 * produces a meaningful signal (vs the deterministic harness's `neutral`).
 */
test.describe('mind real-embedder bench — default (rerank ON)', () => {
  test.skip(!BENCH_ENABLED, 'set MIND_BENCH_REAL=1 and run with kb-dev up (needs OpenAI + Qdrant)')

  test('M-BENCH-01: golden set meets the retrieval quality gate', async ({ request }) => {
    resetLedger() // default runs first → start a fresh A/B ledger
    await ensureBenchIndex(request)

    const m = await runBench(request, 'default')
    recordMetrics(m)

    // Surface the numbers in the test log for the operator.
    console.log(`[mind-bench/default] hit@1=${m['hit@1'].toFixed(3)} hit@5=${m['hit@5'].toFixed(3)} mrr=${m.mrr.toFixed(3)} semWinRate=${m.semanticWinRate.toFixed(3)}`)
    for (const q of m.perQuery) {
      console.log(`  ${q.id} rr=${q.rr.toFixed(2)} top=${q.top ?? '∅'}`)
    }

    expect(m['hit@5'], 'hit@5 below gate').toBeGreaterThanOrEqual(GATE['hit@5'])
    expect(m.mrr, 'MRR below gate').toBeGreaterThanOrEqual(GATE.mrr)
  })
})
