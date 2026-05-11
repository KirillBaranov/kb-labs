#!/usr/bin/env node
/**
 * new-tests check
 *
 * Finds newly added .ts source files that have no corresponding test file.
 * A test file is any file matching: *.spec.ts, *.test.ts, or __tests__/*.ts
 *
 * Outputs TypedCheckOutput JSON:
 *   { ok: boolean, items: Array<{ target, message, fix }> }
 *
 * Runs in pkg.dir (cwd = package directory).
 * Base ref comes from KB_QA_BASE env var (set by kb qa check via --base flag),
 * falling back to the first CLI argument, then 'main'.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const base = process.env.KB_QA_BASE ?? process.argv[2] ?? 'main';
const cwd = process.cwd();

/** Get files added in this diff within the current package dir */
function getNewFiles() {
  try {
    const out = execSync(
      `git diff --diff-filter=A ${base}...HEAD --name-only`,
      { cwd, encoding: 'utf-8' },
    ).trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Check if a source file has a matching test file */
function hasTest(file) {
  const dir = dirname(file);
  const name = basename(file, '.ts');

  const candidates = [
    join(cwd, dir, `${name}.spec.ts`),
    join(cwd, dir, `${name}.test.ts`),
    join(cwd, dir, '__tests__', `${name}.ts`),
    join(cwd, dir, '__tests__', `${name}.spec.ts`),
    join(cwd, dir, '__tests__', `${name}.test.ts`),
    // common: tests/ sibling directory
    join(cwd, 'tests', `${name}.spec.ts`),
    join(cwd, 'tests', `${name}.test.ts`),
  ];

  return candidates.some(existsSync);
}

/** Skip files that are themselves tests or non-source */
function isSourceFile(file) {
  if (/\.(spec|test)\.ts$/.test(file)) return false;
  if (file.includes('__tests__')) return false;
  if (!file.endsWith('.ts')) return false;
  // skip type declaration files
  if (file.endsWith('.d.ts')) return false;
  // skip index re-export files (optional — comment out if too aggressive)
  // if (basename(file) === 'index.ts') return false;
  return true;
}

const newFiles = getNewFiles();
const sourceFiles = newFiles.filter(isSourceFile);
const missing = sourceFiles.filter(f => !hasTest(f));

const items = missing.map(f => ({
  target: f,
  message: 'New source file has no corresponding test',
  fix: `Create ${dirname(f)}/${basename(f, '.ts')}.spec.ts`,
}));

process.stdout.write(JSON.stringify({ ok: items.length === 0, items }));
