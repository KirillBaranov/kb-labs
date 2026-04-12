/**
 * i18n-audit.mjs — static analysis of next-intl translation keys.
 *
 * All pages/components use full dot-notation keys with no namespace:
 *   t('about.hero.title')   t.raw('home.trust.items')   t.rich('signup.form.note', ...)
 *
 * Checks:
 *   1. MISSING  — code references a key absent from messages/en.json  → exit 1 (blocks CI)
 *   2. UNUSED   — messages/en.json has a key never referenced in code  → warning (--strict: exit 1)
 *   3. MISMATCH — messages/en.json and messages/ru.json differ in keys → exit 1
 *
 * Usage:
 *   node scripts/i18n-audit.mjs
 *   node scripts/i18n-audit.mjs --strict   # exit 1 on unused too
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MESSAGES_DIR = join(ROOT, 'messages');
const SOURCE_DIRS = [join(ROOT, 'app'), join(ROOT, 'components')];
const SOURCE_EXTS = new Set(['.tsx', '.ts']);
const STRICT = process.argv.includes('--strict');
const CI = process.env.CI === 'true' || process.argv.includes('--ci');

// ─── Colours ──────────────────────────────────────────────────────────────────
const c = CI
  ? { red: s => s, yellow: s => s, green: s => s, gray: s => s, bold: s => s }
  : {
      red:    s => `\x1b[31m${s}\x1b[0m`,
      yellow: s => `\x1b[33m${s}\x1b[0m`,
      green:  s => `\x1b[32m${s}\x1b[0m`,
      gray:   s => `\x1b[90m${s}\x1b[0m`,
      bold:   s => `\x1b[1m${s}\x1b[0m`,
    };

// ─── 1. Load & flatten messages ───────────────────────────────────────────────

/**
 * Flatten a JSON object to dot-notation keys.
 * leavesOnly=false → all nodes (leaves + intermediate objects/arrays).
 *   Intermediate nodes are valid t.raw() targets, so we need them for MISSING.
 * leavesOnly=true  → leaves only (for UNUSED — parent nodes accessed transitively).
 */
function flattenKeys(obj, prefix = '', leavesOnly = false) {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const isLeaf = v === null || typeof v !== 'object' || Array.isArray(v);
    if (isLeaf) {
      out.add(full);
    } else {
      if (!leavesOnly) out.add(full);
      for (const sub of flattenKeys(v, full, leavesOnly)) out.add(sub);
    }
  }
  return out;
}

function loadMessages(locale) {
  const path = join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const enJson = loadMessages('en');
const ruJson = loadMessages('ru');
const enKeys     = flattenKeys(enJson, '', false); // all nodes — for MISSING check
const enLeafKeys = flattenKeys(enJson, '', true);  // leaves only — for UNUSED check
const ruLeafKeys = flattenKeys(ruJson, '', true);

// ─── 2. Walk source files ─────────────────────────────────────────────────────

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE_EXTS.has(extname(entry.name))) yield full;
  }
}

const sourceFiles = SOURCE_DIRS.flatMap(d => [...walk(d)]);

// ─── 3. Extract keys from source files ────────────────────────────────────────
//
// All code uses full dot-notation keys with no namespace, so we simply look for:
//   t('some.key')   t.raw('some.key')   t.rich('some.key', ...)
// where the key is a static string literal (single or double quotes only).
// Template literals with ${} are skipped — dynamic keys can't be statically tracked.

const KEY_REGEX = /\bt(?:\.raw|\.rich)?\(\s*(['"])([^'"$`]+)\1/g;

function extractRefs(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const refs = [];

  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') lineStarts.push(i + 1);
  }
  const posToLine = pos => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  let m;
  KEY_REGEX.lastIndex = 0;
  while ((m = KEY_REGEX.exec(src)) !== null) {
    const key = m[2];
    // Skip: rich text tag names, empty strings, or keys with no dot (not a full translation key)
    if (!key || key.startsWith('{') || !key.includes('.')) continue;
    refs.push({ key, file: filePath, line: posToLine(m.index) });
  }
  return refs;
}

// ─── 4. Collect all refs ──────────────────────────────────────────────────────

const allRefs = sourceFiles.flatMap(f => extractRefs(f));

/** @type {Map<string, {file:string, line:number}[]>} */
const refsByKey = new Map();
for (const ref of allRefs) {
  if (!refsByKey.has(ref.key)) refsByKey.set(ref.key, []);
  refsByKey.get(ref.key).push({ file: ref.file, line: ref.line });
}

// ─── 5. EN ↔ RU symmetry ──────────────────────────────────────────────────────

const missingInRu = [...enLeafKeys].filter(k => !ruLeafKeys.has(k));
const extraInRu   = [...ruLeafKeys].filter(k => !enLeafKeys.has(k));

// ─── 6. MISSING — code refs that don't exist in messages ─────────────────────

const missingRefs = [];
for (const [key, locs] of refsByKey) {
  if (!enKeys.has(key)) {
    missingRefs.push({ key, locs });
  }
}

// ─── 7. UNUSED — leaf keys in messages not referenced in code ────────────────

const unusedKeys = [...enLeafKeys].filter(k => !refsByKey.has(k));

// ─── 8. Report ────────────────────────────────────────────────────────────────

let exitCode = 0;
const sep = '─'.repeat(60);

console.log(`\n${c.bold('KB Labs i18n Audit')}`);
console.log(c.gray(sep));
console.log(c.gray(`Messages : en.json (${enLeafKeys.size} leaf keys) · ru.json (${ruLeafKeys.size} leaf keys)`));
console.log(c.gray(`Source   : ${sourceFiles.length} files in app/ + components/`));
console.log(c.gray(`Refs     : ${refsByKey.size} unique keys referenced`));
console.log();

// ── EN ↔ RU mismatch ──────────────────────────────────────────────────────────
if (missingInRu.length > 0 || extraInRu.length > 0) {
  exitCode = 1;
  console.log(c.red(c.bold('❌  EN ↔ RU mismatch')));
  missingInRu.forEach(k => console.log(c.red(`   missing in ru.json  · ${k}`)));
  extraInRu.forEach(k   => console.log(c.red(`   extra in ru.json    · ${k}`)));
  console.log();
}

// ── MISSING keys (fatal) ──────────────────────────────────────────────────────
if (missingRefs.length > 0) {
  exitCode = 1;
  console.log(c.red(c.bold(`❌  MISSING keys (${missingRefs.length}) — referenced in code, absent from messages`)));
  console.log(c.red('   These will render empty or throw in production.\n'));
  for (const { key, locs } of missingRefs) {
    console.log(c.red(`   ${key}`));
    for (const loc of locs.slice(0, 3)) {
      console.log(c.gray(`     ${relative(ROOT, loc.file)}:${loc.line}`));
    }
    if (locs.length > 3) console.log(c.gray(`     … and ${locs.length - 3} more`));
  }
  console.log();
}

// ── UNUSED keys (warning / strict) ────────────────────────────────────────────
if (unusedKeys.length > 0) {
  if (STRICT) exitCode = 1;
  const icon  = STRICT ? c.red('❌') : c.yellow('⚠️ ');
  const label = STRICT
    ? `UNUSED keys (${unusedKeys.length}) — strict mode`
    : `UNUSED keys (${unusedKeys.length}) — in messages but never referenced`;
  console.log(`${icon}  ${c.bold(label)}`);
  if (!STRICT) {
    console.log(c.yellow('   Dynamic keys (template literals) are excluded from tracking.\n'));
  }
  unusedKeys.forEach(k => console.log(c.yellow(`   · ${k}`)));
  console.log();
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(c.gray(sep));
if (exitCode === 0 && unusedKeys.length === 0) {
  console.log(c.green(c.bold('✅  All i18n keys are accounted for — no missing, no unused, EN = RU.')));
} else if (exitCode === 0) {
  console.log(c.green('✅  No missing keys.') + c.yellow(`  (${unusedKeys.length} unused — run --strict to enforce cleanup)`));
} else {
  if (missingRefs.length > 0) console.log(c.red(c.bold(`   ${missingRefs.length} MISSING — fix before deploying`)));
  if (missingInRu.length || extraInRu.length) console.log(c.red(c.bold('   EN ↔ RU out of sync')));
  if (STRICT && unusedKeys.length) console.log(c.yellow(c.bold(`   ${unusedKeys.length} UNUSED (strict)`)));
}
console.log();

process.exit(exitCode);
