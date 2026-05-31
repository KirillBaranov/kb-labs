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
 * M-BENCH-03 (hyde-on): the A/B gate for the HyDE port.
 *
 * Runs the golden set with HyDE ENABLED (overlay), then compares against the
 * HyDE-OFF (`default`) run recorded earlier in this runner pass. HyDE costs an
 * LLM call per query, so it ships only if it does NOT regress retrieval quality
 * on the real embedder (and ideally lifts concept queries). The delta is logged
 * for the keep/revert decision.
 */
test.describe('mind real-embedder bench — A/B (HyDE ON vs OFF)', () => {
  test.skip(!BENCH_ENABLED, 'set MIND_BENCH_REAL=1 and run with kb-dev up (needs OpenAI + Qdrant)')

  test('M-BENCH-03: enabling HyDE does not regress quality (ON ≥ OFF)', async ({ request }) => {
    const base = await resolveMindBase(request)
    await ensureBenchIndex(request, base)

    const on = await runBench(request, base, 'hyde-on')
    recordMetrics(on)

    const off = readMetrics('default')
    expect(off, 'default (HyDE OFF) metrics missing — did the default scenario run first?').toBeTruthy()

    const dMrr = on.mrr - off!.mrr
    const dHit5 = on['hit@5'] - off!['hit@5']
    console.log(
      `[mind-bench/AB] HyDE ON vs OFF — Δmrr=${dMrr.toFixed(3)} Δhit@5=${dHit5.toFixed(3)} ` +
        `(ON mrr=${on.mrr.toFixed(3)} hit@5=${on['hit@5'].toFixed(3)} | OFF mrr=${off!.mrr.toFixed(3)} hit@5=${off!['hit@5'].toFixed(3)})`,
    )

    const TOL = 0.02
    expect(on.mrr, 'HyDE ON regressed MRR vs OFF').toBeGreaterThanOrEqual(off!.mrr - TOL)
    expect(on['hit@5'], 'HyDE ON regressed hit@5 vs OFF').toBeGreaterThanOrEqual(off!['hit@5'] - TOL)
  })
})
