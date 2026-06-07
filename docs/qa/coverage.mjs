#!/usr/bin/env node
/**
 * QA scenario coverage summary.
 *
 * Reads the frontmatter of every docs/qa/scenarios/S-*.md and prints how many
 * scenarios are automated vs still manual, broken down by priority. Use it
 * before a release to see what still needs a hand pass.
 *
 *   node docs/qa/coverage.mjs            # human summary
 *   node docs/qa/coverage.mjs --json     # machine-readable (for CI comments)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(here, 'scenarios');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const files = readdirSync(scenariosDir).filter((f) => /^S-\d+.*\.md$/.test(f));
const rows = files.map((f) => {
  const fm = parseFrontmatter(readFileSync(join(scenariosDir, f), 'utf8'));
  return {
    id: fm.id ?? f.replace(/\.md$/, ''),
    title: fm.title ?? '',
    priority: (fm.priority ?? '—').toUpperCase(),
    automation: fm.automation ?? 'manual',
  };
});

const byPriority = {};
for (const r of rows) {
  byPriority[r.priority] ??= { total: 0, automated: 0, manual: 0 };
  byPriority[r.priority].total++;
  if (r.automation === 'e2e-done') byPriority[r.priority].automated++;
  else byPriority[r.priority].manual++;
}

const summary = {
  total: rows.length,
  automated: rows.filter((r) => r.automation === 'e2e-done').length,
  byPriority,
  manualP0: rows.filter((r) => r.priority === 'P0' && r.automation !== 'e2e-done').map((r) => r.id),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
  process.exit(0);
}

console.log(`\nQA scenario coverage — ${summary.automated}/${summary.total} automated (e2e-done)\n`);
for (const [prio, s] of Object.entries(byPriority).sort()) {
  console.log(`  ${prio.padEnd(4)} ${s.automated}/${s.total} automated, ${s.manual} manual`);
}
if (summary.manualP0.length > 0) {
  console.log(`\n  ⚠ P0 scenarios still manual: ${summary.manualP0.join(', ')}`);
}
console.log('');
