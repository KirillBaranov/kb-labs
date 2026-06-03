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
 * M-BENCH-04 (expand-on): the A/B gate for query expansion.
 *
 * Runs the golden set with expansion ENABLED (overlay), then compares against
 * the OFF (`default`) run recorded earlier in this runner pass. Expansion costs
 * an LLM call per query, so it ships on-by-default only if it does NOT regress
 * retrieval quality on the real embedder (and ideally lifts concept queries
 * with vocabulary mismatch). The delta is logged for the keep/revert decision.
 */
test.describe('mind real-embedder bench — A/B (expansion ON vs OFF)', () => {
  test.skip(!BENCH_ENABLED, 'set MIND_BENCH_REAL=1 and run with kb-dev up (needs OpenAI + Qdrant)')

  test('M-BENCH-04: enabling query expansion does not regress quality (ON ≥ OFF)', async ({ request }) => {
    const base = await resolveMindBase(request)
    await ensureBenchIndex(request, base)

    const on = await runBench(request, base, 'expand-on')
    recordMetrics(on)

    const off = readMetrics('default')
    expect(off, 'default (expansion OFF) metrics missing — did the default scenario run first?').toBeTruthy()

    const dMrr = on.mrr - off!.mrr
    const dHit5 = on['hit@5'] - off!['hit@5']
    const dSwr = on.semanticWinRate - off!.semanticWinRate
    console.log(
      `[mind-bench/AB] expansion ON vs OFF — Δmrr=${dMrr.toFixed(3)} Δhit@5=${dHit5.toFixed(3)} ΔsemWinRate=${dSwr.toFixed(3)} ` +
        `(ON mrr=${on.mrr.toFixed(3)} hit@5=${on['hit@5'].toFixed(3)} | OFF mrr=${off!.mrr.toFixed(3)} hit@5=${off!['hit@5'].toFixed(3)})`,
    )

    const TOL = 0.02
    expect(on.mrr, 'expansion ON regressed MRR vs OFF').toBeGreaterThanOrEqual(off!.mrr - TOL)
    expect(on['hit@5'], 'expansion ON regressed hit@5 vs OFF').toBeGreaterThanOrEqual(off!['hit@5'] - TOL)
  })
})
