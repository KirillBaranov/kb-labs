/**
 * Corpus degradation for the thesis test ("value ∝ 1 / doc quality").
 *
 * Strips the human-readable layer — block/JSDoc comments and line comments —
 * leaving the code itself intact. This simulates an UNDOCUMENTED codebase:
 *  - lexical search (grep / BM25) over a natural-language query loses the words
 *    that previously lived in comments → recall drops;
 *  - semantic search keeps embedding the actual code, so Mind's vector side
 *    should still surface the right file.
 * The gap between the two on clean vs degraded corpora is the proof of value.
 *
 * Regex-based on purpose: this is a benchmark degradation, not a parser. Edge
 * cases (`//` inside string literals/URLs) are rare in this corpus and don't
 * change the aggregate signal.
 */

import fs from 'node:fs'
import path from 'node:path'
import { readCorpus } from './corpus.js'

/** Remove block/JSDoc comments and line comments; keep code + blank structure. */
export function stripComments(text: string): string {
  return text
    // /* ... */ and /** ... */ (non-greedy, across lines)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // // ... to end of line, unless the // is part of `://` (URL/scheme)
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // collapse the blank lines the stripping leaves behind
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Write a comment-stripped copy of every source file under `srcRootAbs` into
 * `destRootAbs`, preserving the relative tree. Returns the number of files written.
 */
export function writeDegradedCorpus(srcRootAbs: string, destRootAbs: string): number {
  // Read relative to srcRootAbs so the mirrored tree is rooted at destRootAbs.
  const files = readCorpus(srcRootAbs, srcRootAbs)
  fs.rmSync(destRootAbs, { recursive: true, force: true })
  for (const f of files) {
    const dest = path.join(destRootAbs, f.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, stripComments(f.text), 'utf8')
  }
  return files.length
}
