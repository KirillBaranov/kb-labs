/**
 * Corpus reader for the grep-vs-mind head-to-head.
 *
 * Walks a directory and returns each source file's repo-relative path + text —
 * the same set the engine indexes, so the literal grep baseline scores over the
 * identical corpus.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CorpusFile {
  /** Repo-relative path (matches what /search returns, suffix-comparable to golden). */
  path: string
  text: string
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.md'])
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'coverage', 'report'])

/** Recursively read source files under `rootDir` (absolute), relative to `repoRoot`. */
export function readCorpus(rootDir: string, repoRoot: string): CorpusFile[] {
  const out: CorpusFile[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIR.has(entry.name)) {
          walk(path.join(dir, entry.name))
        }
        continue
      }
      const ext = path.extname(entry.name)
      if (!SOURCE_EXT.has(ext)) {
        continue
      }
      const abs = path.join(dir, entry.name)
      out.push({ path: path.relative(repoRoot, abs), text: fs.readFileSync(abs, 'utf8') })
    }
  }
  walk(rootDir)
  return out
}
