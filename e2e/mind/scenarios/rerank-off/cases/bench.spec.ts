import { test, expect } from '@playwright/test'
import {
  BENCH_ENABLED,
  ensureBenchIndex,
  readMetrics,
  recordMetrics,
  resolveMindBase,
  runBench,
} from '../../../lib/bench.js'

/**
 * M-BENCH (rerank-off): the A/B gate.
 *
 * Runs the same golden set with rerank DISABLED (overlay), then compares against
 * the rerank-ON (`default`) metrics recorded earlier in this runner pass.
 * Verdict policy: the feature (rerank ON) must NOT regress quality vs OFF. This
 * is the real-embedder A/B every semantic feature port must clear.
 */
test.describe('mind real-embedder bench — A/B (rerank OFF vs ON)', () => {
  test.skip(!BENCH_ENABLED, 'set MIND_BENCH_REAL=1 and run with kb-dev up (needs OpenAI + Qdrant)')

  test('M-BENCH-02: enabling rerank does not regress quality (ON ≥ OFF)', async ({ request }) => {
    const base = await resolveMindBase(request)
    await ensureBenchIndex(request, base)

    const off = await runBench(request, base, 'rerank-off')
    recordMetrics(off)

    const on = readMetrics('default')
    expect(on, 'default (rerank ON) metrics missing — did the default scenario run first?').toBeTruthy()

    const dMrr = on!.mrr - off.mrr
    const dHit5 = on!['hit@5'] - off['hit@5']
    console.log(
      `[mind-bench/AB] rerank ON vs OFF — Δmrr=${dMrr.toFixed(3)} Δhit@5=${dHit5.toFixed(3)} ` +
        `(ON mrr=${on!.mrr.toFixed(3)} hit@5=${on!['hit@5'].toFixed(3)} | OFF mrr=${off.mrr.toFixed(3)} hit@5=${off['hit@5'].toFixed(3)})`,
    )

    // Tolerance avoids flagging float/embedding noise as a regression.
    const TOL = 0.02
    expect(on!.mrr, 'rerank ON regressed MRR vs OFF').toBeGreaterThanOrEqual(off.mrr - TOL)
    expect(on!['hit@5'], 'rerank ON regressed hit@5 vs OFF').toBeGreaterThanOrEqual(off['hit@5'] - TOL)
  })
})
