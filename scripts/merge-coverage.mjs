#!/usr/bin/env node
// Aggregates per-package coverage-final.json into a single summary.
// Usage:
//   node scripts/merge-coverage.mjs          # human output
//   node scripts/merge-coverage.mjs --json   # machine-readable JSON

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const JSON_MODE = process.argv.includes('--json')
const OUT_DIR = join(ROOT, 'coverage')
const SUMMARY = join(OUT_DIR, 'summary.json')

mkdirSync(OUT_DIR, { recursive: true })

function* walkCoverage(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'coverage') {
        yield full
      } else {
        yield* walkCoverage(full)
      }
    }
  }
}

function readPackageName(covDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(covDir), 'package.json'), 'utf8'))
    return pkg.name ?? dirname(covDir).replace(ROOT, '').replace(/^\//, '')
  } catch {
    return dirname(covDir).replace(ROOT, '').replace(/^\//, '')
  }
}

function parseCoverageFinal(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  let stmts = 0, stmtsHit = 0, branches = 0, branchesHit = 0, fns = 0, fnsHit = 0

  for (const fc of Object.values(data)) {
    const s = fc.s ?? {}
    stmts += Object.keys(s).length
    stmtsHit += Object.values(s).filter(v => v > 0).length

    for (const b of Object.values(fc.b ?? {})) {
      branches += b.length
      branchesHit += b.filter(v => v > 0).length
    }

    const f = fc.f ?? {}
    fns += Object.keys(f).length
    fnsHit += Object.values(f).filter(v => v > 0).length
  }

  return { stmts, stmtsHit, branches, branchesHit, fns, fnsHit }
}

const packages = []
let totals = { stmts: 0, stmtsHit: 0, branches: 0, branchesHit: 0, fns: 0, fnsHit: 0 }

for (const covDir of walkCoverage(ROOT)) {
  const finalPath = join(covDir, 'coverage-final.json')
  try {
    statSync(finalPath)
  } catch {
    continue
  }

  const name = readPackageName(covDir)
  try {
    const c = parseCoverageFinal(finalPath)
    packages.push({
      package: name,
      statements: { hit: c.stmtsHit, total: c.stmts, pct: c.stmts ? +(c.stmtsHit / c.stmts * 100).toFixed(1) : 0 },
      branches:   { hit: c.branchesHit, total: c.branches, pct: c.branches ? +(c.branchesHit / c.branches * 100).toFixed(1) : 0 },
      functions:  { hit: c.fnsHit, total: c.fns, pct: c.fns ? +(c.fnsHit / c.fns * 100).toFixed(1) : 0 },
    })
    for (const k of ['stmts', 'stmtsHit', 'branches', 'branchesHit', 'fns', 'fnsHit'])
      totals[k] += c[k]
  } catch (e) {
    if (!JSON_MODE) process.stderr.write(`  warn: ${name}: ${e.message}\n`)
  }
}

packages.sort((a, b) => a.statements.pct - b.statements.pct)

const result = {
  ok: true,
  total: {
    packages: packages.length,
    statements: { hit: totals.stmtsHit, total: totals.stmts, pct: totals.stmts ? +(totals.stmtsHit / totals.stmts * 100).toFixed(1) : 0 },
    branches:   { hit: totals.branchesHit, total: totals.branches, pct: totals.branches ? +(totals.branchesHit / totals.branches * 100).toFixed(1) : 0 },
    functions:  { hit: totals.fnsHit, total: totals.fns, pct: totals.fns ? +(totals.fnsHit / totals.fns * 100).toFixed(1) : 0 },
  },
  worst: packages.slice(0, 20),
  packages,
}

writeFileSync(SUMMARY, JSON.stringify(result, null, 2))

if (JSON_MODE) {
  process.stdout.write(readFileSync(SUMMARY, 'utf8'))
  process.exit(0)
}

const t = result.total
console.log(`\nCoverage Summary (${t.packages} packages)`)
console.log(`  Statements: ${t.statements.pct}%  (${t.statements.hit}/${t.statements.total})`)
console.log(`  Branches:   ${t.branches.pct}%  (${t.branches.hit}/${t.branches.total})`)
console.log(`  Functions:  ${t.functions.pct}%  (${t.functions.hit}/${t.functions.total})`)
console.log(`\nWorst covered (bottom 10):`)
for (const p of packages.slice(0, 10))
  console.log(`  ${String(p.statements.pct).padStart(5)}%  ${p.package}`)
console.log(`\nJSON report: coverage/summary.json`)
