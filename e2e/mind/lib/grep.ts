/**
 * Literal keyword baseline — the "grep" in grep-vs-mind.
 *
 * Models what a developer (or a non-semantic agent) gets from `grep`: rank files
 * by how many of the query's content words appear in them. No stemming, no
 * embeddings — pure lexical presence. This is the bar Mind must clear to justify
 * itself; on a clean, well-named/-commented corpus grep already does well, which
 * is exactly why the degraded-corpus variant is the honest test.
 */

import type { CorpusFile } from './corpus.js'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'that', 'this',
  'it', 'is', 'are', 'be', 'how', 'does', 'do', 'what', 'when', 'where', 'into', 'one',
  'from', 'by', 'as', 'at', 'we', 'you', 'they', 'first', 'instead', 'over', 'up', 'out',
])

export function tokenizeQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  ]
}

/**
 * Rank corpus files by lexical match to the query and return the top-k paths.
 * Score = (# distinct query terms present) primary, (total occurrences) tiebreak —
 * a file mentioning more of the query's words, more often, ranks higher.
 */
export function grepSearch(corpus: CorpusFile[], query: string, k: number): string[] {
  const terms = tokenizeQuery(query)
  if (terms.length === 0) {
    return []
  }
  const scored = corpus.map((f) => {
    const lower = f.text.toLowerCase()
    let distinct = 0
    let total = 0
    for (const t of terms) {
      // Count occurrences of the whole word `t`.
      const matches = lower.split(t).length - 1
      if (matches > 0) {
        distinct += 1
        total += matches
      }
    }
    return { path: f.path, distinct, total }
  })
  return scored
    .filter((s) => s.distinct > 0)
    .sort((a, b) => b.distinct - a.distinct || b.total - a.total)
    .slice(0, k)
    .map((s) => s.path)
}
