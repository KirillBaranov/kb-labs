/**
 * @module @kb-labs/workflow-runtime/lint
 *
 * Pure file-discovery + validation utility behind `kb workflow lint`.
 *
 * Mirrors WorkspaceRegistry discovery (registry/workspace-registry.ts) and the
 * WorkflowLoader error format, but uses a non-throwing `safeParse` so it can
 * collect issues across every file instead of bailing on the first failure.
 */

import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { relative, resolve, dirname, basename } from 'node:path'

import fg from 'fast-glob'
import { parse as parseYaml } from 'yaml'
import { WorkflowSpecSchema, type FileLintResult } from '@kb-labs/workflow-contracts'

export interface LintOptions {
  /**
   * File or directory to lint. A directory is globbed; a single file is linted
   * directly. Defaults to `.kb/workflows` under `cwd`.
   */
  path?: string
  /** Working directory used to resolve `path`. Defaults to `process.cwd()`. */
  cwd?: string
  /** Glob patterns used when `path` is a directory. */
  patterns?: string[]
}

const DEFAULT_PATTERNS = ['**/*.yml', '**/*.yaml', '**/*.json']

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Lint workflow files against WorkflowSpecSchema.
 *
 * @returns one FileLintResult per discovered file (or the single targeted file).
 */
export async function lintWorkflowFiles(opts: LintOptions = {}): Promise<FileLintResult[]> {
  const cwd = opts.cwd ?? process.cwd()
  const target = resolve(cwd, opts.path ?? '.kb/workflows')

  // Single-file mode: lint exactly that file, attribute relative to its dir.
  if (isFile(target)) {
    return [await lintOne(target, dirname(target))]
  }

  const files = await fg(opts.patterns ?? DEFAULT_PATTERNS, {
    cwd: target,
    absolute: true,
    onlyFiles: true,
    ignore: ['node_modules/**', 'dist/**', '.git/**'],
  })

  return Promise.all(files.map((file) => lintOne(file, target)))
}

async function lintOne(file: string, base: string): Promise<FileLintResult> {
  const relativePath = relative(base, file) || basename(file)
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed = file.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw)
    const result = WorkflowSpecSchema.safeParse(parsed)
    if (result.success) {
      return { file, relativePath, ok: true, errors: [], warnings: [] }
    }
    return {
      file,
      relativePath,
      ok: false,
      errors: result.error.issues.map(formatIssue),
      warnings: [],
    }
  } catch (err) {
    // Parse/IO failure (malformed YAML/JSON, unreadable file).
    return {
      file,
      relativePath,
      ok: false,
      errors: [`(root): ${(err as Error).message}`],
      warnings: [],
    }
  }
}

/**
 * Format a ZodIssue as `<json-path>: <message>`. Refine-level issues carry an
 * empty path, so fall back to `(root)` — matching the WorkflowLoader format.
 */
function formatIssue(issue: { path: (string | number)[]; message: string }): string {
  const path = issue.path.join('.') || '(root)'
  return `${path}: ${issue.message}`
}
