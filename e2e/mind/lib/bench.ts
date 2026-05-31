/**
 * Real-embedder benchmark harness for the e2e/mind domain.
 *
 * Unlike the in-process deterministic harness in `@kb-labs/mind-core`
 * (toy bag-of-words embedder → `neutral` verdict on semantic features), this
 * runs the golden query-set against the LIVE Mind REST surface backed by the
 * platform's configured adapters (OpenAI embeddings + Qdrant). That is the only
 * place a semantic feature (rerank / dedup / HyDE) produces a real A/B signal.
 *
 * Gated behind `MIND_BENCH_REAL=1` so CI and casual `pnpm e2e` runs (no API
 * key / no Qdrant) skip it instead of failing. Run locally with:
 *   kb-dev start
 *   MIND_BENCH_REAL=1 cd e2e/mind && pnpm e2e
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Dedicated index so the bench never collides with a developer's real corpus. */
export const BENCH_INDEX = 'e2e-bench'

/**
 * The bench corpus — the engine's own `core/src`. Richer than the contracts
 * wire layer: real logic with distinct responsibilities per file, so a query
 * can describe a CONCEPT in words that don't appear verbatim in the target
 * file. That divergence is what exercises semantic retrieval (and HyDE);
 * keyword-only queries over terse schemas can't.
 */
export const BENCH_SCOPE = 'plugins/mind/core/src'

/** Real-embedder bench only runs when explicitly opted in (needs API key + Qdrant). */
export const BENCH_ENABLED = process.env.MIND_BENCH_REAL === '1'

/**
 * Graded golden set over the bench corpus. `relevant` are path suffixes — we
 * match by `endsWith` so we don't care whether the engine reports cwd-relative
 * or scope-relative paths.
 */
export interface GoldenQuery {
  id: string
  query: string
  relevant: string[]
}

export const GOLDEN: GoldenQuery[] = [
  // --- exact / keyword-ish (both lists should retrieve these well) ---
  { id: 'EX-01', query: 'BM25 keyword scoring over the corpus', relevant: ['retrieval/bm25.ts'] },
  { id: 'EX-02', query: 'the createMind facade object CLI and REST both call', relevant: ['mind.ts'] },
  // --- concept-heavy: query wording diverges from the file's code vocabulary ---
  { id: 'C-01', query: 'how does it blend keyword matches and vector similarity into one ranked list', relevant: ['retrieval/fuse.ts'] },
  { id: 'C-02', query: 'stop the assistant from making up answers that the sources do not support', relevant: ['answer/verify.ts'] },
  { id: 'C-03', query: 'cut a source file into smaller overlapping passages for indexing', relevant: ['ingest/chunk.ts', 'ingest/structural.ts'] },
  { id: 'C-04', query: 'draft an imaginary ideal answer first and search with that instead of the question', relevant: ['retrieval/hyde.ts'] },
  { id: 'C-05', query: 'remove results that repeat the same content', relevant: ['retrieval/dedup.ts'] },
  { id: 'C-06', query: 'walk the project tree for files to ingest while ignoring dependencies and build output', relevant: ['ingest/discover.ts'] },
  { id: 'C-07', query: 'split a hard multi-part question into smaller focused sub-questions', relevant: ['answer/decompose.ts'] },
  { id: 'C-08', query: 'learn from what users searched before to adapt over time', relevant: ['feedback/history.ts'] },
  { id: 'C-09', query: 'compose the final written reply out of the retrieved snippets', relevant: ['answer/synthesize.ts', 'answer/answer.ts'] },
  { id: 'C-10', query: 'only re-process files that actually changed since the last run', relevant: ['ingest/ingest.ts'] },
  { id: 'C-11', query: 'push results higher when the exact search words appear in the code', relevant: ['retrieval/rerank.ts'] },
]

// ── IR metrics (file-level; collapse multiple chunks of the same file) ──────

function isRelevant(file: string, relevant: string[]): boolean {
  return relevant.some((r) => file.endsWith(r))
}

export function hitAtK(retrieved: string[], relevant: string[], k: number): number {
  return retrieved.slice(0, k).some((f) => isRelevant(f, relevant)) ? 1 : 0
}

export function reciprocalRank(retrieved: string[], relevant: string[]): number {
  const idx = retrieved.findIndex((f) => isRelevant(f, relevant))
  return idx === -1 ? 0 : 1 / (idx + 1)
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

export interface BenchMetrics {
  scenario: string
  queries: number
  'hit@1': number
  'hit@5': number
  mrr: number
  perQuery: { id: string; hit1: number; rr: number; top: string | undefined }[]
}

// ── live REST helpers ───────────────────────────────────────────────────────

/** Mind's own routes live under the plugin basePath; probe `/health` to find it. */
export async function resolveMindBase(request: APIRequestContext): Promise<string> {
  const candidates = [`${REST}/v1/plugins/mind`, `${REST}/api/v1/plugins/mind`]
  for (const base of candidates) {
    try {
      const res = await request.get(`${base}/health`)
      if (res.ok()) {
        return base
      }
    } catch {
      // try next
    }
  }
  throw new Error(
    `mind REST surface not reachable at ${candidates.join(' or ')}. ` +
      `Is the platform up (kb-dev start) with the mind plugin loaded?`,
  )
}

async function unwrap(res: { json(): Promise<unknown> }): Promise<any> {
  const body = (await res.json()) as { data?: unknown }
  return body.data ?? body
}

/** (Re)build the bench index from the corpus slice via the live engine. */
export async function ensureBenchIndex(request: APIRequestContext, base: string): Promise<void> {
  const res = await request.post(`${base}/index`, {
    data: { indexId: BENCH_INDEX, scope: BENCH_SCOPE, full: true },
  })
  if (!res.ok()) {
    throw new Error(`index failed: ${res.status()} ${await res.text()}`)
  }
}

/** Run the golden set against live `/search` and compute metrics. */
export async function runBench(
  request: APIRequestContext,
  base: string,
  scenario: string,
): Promise<BenchMetrics> {
  const perQuery: BenchMetrics['perQuery'] = []
  for (const q of GOLDEN) {
    const res = await request.post(`${base}/search`, {
      data: { text: q.query, indexId: BENCH_INDEX, limit: 5 },
    })
    if (!res.ok()) {
      throw new Error(`search failed for ${q.id}: ${res.status()} ${await res.text()}`)
    }
    const data = await unwrap(res)
    const results: { file: string }[] = data.results ?? []
    // File-level, order-preserving dedup.
    const files = [...new Set(results.map((r) => r.file))]
    perQuery.push({
      id: q.id,
      hit1: hitAtK(files, q.relevant, 1),
      rr: reciprocalRank(files, q.relevant),
      top: files[0],
    })
  }

  return {
    scenario,
    queries: GOLDEN.length,
    'hit@1': mean(perQuery.map((p) => p.hit1)),
    'hit@5': mean(perQuery.map((p) => (p.rr > 0 ? 1 : 0))),
    mrr: mean(perQuery.map((p) => p.rr)),
    perQuery,
  }
}

// ── A/B ledger ────────────────────────────────────────────────────────────

const LEDGER = path.join(__dirname, '..', 'report', 'ab-metrics.jsonl')

/** Start a fresh A/B ledger (called by the first scenario so stale runs don't leak). */
export function resetLedger(): void {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
  fs.writeFileSync(LEDGER, '', 'utf8')
}

/** Append one scenario's metrics so scenarios run by the runner can be A/B-compared. */
export function recordMetrics(m: BenchMetrics): void {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
  fs.appendFileSync(LEDGER, JSON.stringify(m) + '\n', 'utf8')
}

/** Most recent recorded metrics for a given scenario, or null if absent. */
export function readMetrics(scenario: string): BenchMetrics | null {
  if (!fs.existsSync(LEDGER)) {
    return null
  }
  const rows = fs
    .readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BenchMetrics)
    .filter((m) => m.scenario === scenario)
  return rows.length > 0 ? rows[rows.length - 1]! : null
}

/**
 * Quality gate thresholds — conservative so the gate guards regressions, not
 * noise. Lower than a keyword-only set would score: the concept queries
 * deliberately diverge from the code's wording, which is harder retrieval.
 */
export const GATE = {
  'hit@5': 0.6,
  mrr: 0.35,
} as const
