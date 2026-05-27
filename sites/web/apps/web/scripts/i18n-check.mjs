#!/usr/bin/env node
/**
 * i18n-check.mjs — translation guard for KB Labs site.
 *
 * Runs in two modes:
 *
 *   STANDALONE  (direct invocation from sites/web/apps/web/):
 *     node scripts/i18n-check.mjs [--strict] [--no-color]
 *     Human-readable terminal output, exit 0/1.
 *
 *   DEVKIT  (via kb-devkit custom_check, language: typescript):
 *     Triggered when KB_DEVKIT_MODE is set. Runs for every TS package,
 *     self-filters by KB_DEVKIT_PACKAGE_NAME:
 *       @kb-labs/web-site     → all 4 checks (owns messages files)
 *       @kb-labs/web-site-ui  → HARDCODED only (kit has user-visible strings)
 *       @kb-labs/web-og       → HARDCODED only
 *       @kb-labs/docs-site    → HARDCODED only
 *       everything else       → skip ({"issues":[]})
 *     Output: {"issues":[...]} to stdout.
 *
 *   DEVKIT FIX  (via kb-devkit fix, KB_DEVKIT_MODE=fix):
 *     Removes UNUSED keys from both en.json and ru.json.
 *     Returns remaining issues after the fix.
 *
 * Checks:
 *   1. MISMATCH   — en.json / ru.json have different key sets          → error
 *   2. MISSING    — code references a key absent from messages          → error
 *   3. HARDCODED  — Cyrillic text ≥ 4 chars in .tsx not via t()        → error
 *   4. UNUSED     — messages key never referenced in source             → warning (--strict → error) [autoFixable]
 *
 * Autofix (devkit fix / --fix):
 *   UNUSED keys are deleted from both JSON files. Empty parent objects are pruned.
 *
 * Suppression:
 *   // i18n-ignore  at end of any source line → skips HARDCODED for that line.
 *   Dynamic template-literal keys (t(`key.${x}`)) are excluded from #2 and #4.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, writeSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Mode ─────────────────────────────────────────────────────────────────────

const DEVKIT_MODE = Boolean(process.env.KB_DEVKIT_MODE);
const DEVKIT_FIX  = process.env.KB_DEVKIT_MODE === 'fix';
const FIX_MODE    = DEVKIT_FIX || process.argv.includes('--fix');
const DRY_RUN     = process.env.KB_DEVKIT_DRY_RUN === 'true' || process.argv.includes('--dry-run');
const STRICT      = process.argv.includes('--strict') || (DEVKIT_MODE && !DEVKIT_FIX);
const NO_COLOR    = process.env.CI === 'true' || process.argv.includes('--no-color') || DEVKIT_MODE;

// Satellite site packages: HARDCODED check only (no messages files).
const HARDCODED_ONLY_PKGS = new Set([
  '@kb-labs/web-site-ui',
  '@kb-labs/web-og',
  '@kb-labs/docs-site',
]);

// ─── Shared utilities (defined early — used by devkit early-exit paths) ───────

const SOURCE_EXTS = new Set(['.tsx', '.ts']);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE_EXTS.has(extname(entry.name))) yield full;
  }
}

const CYRILLIC_RUN    = /[а-яёА-ЯЁ]{4,}/;
const STRIP_T_CALL    = /\bt(?:\.raw|\.rich)?\(\s*['"][^'"$`]+['"]/g;
const STRIP_LINE_TAIL = /\s+\/\/(?!.*i18n-ignore).*$/;

function extractHardcoded(filePath) {
  if (!filePath.endsWith('.tsx')) return [];
  const src    = readFileSync(filePath, 'utf8');
  const lines  = src.split('\n');
  const issues = [];
  let inBlock  = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (inBlock) { if (raw.includes('*/')) inBlock = false; continue; }
    if (raw.includes('/*') && !raw.includes('*/')) inBlock = true;
    const trimmed = raw.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (raw.includes('i18n-ignore')) continue;
    let line = raw.replace(STRIP_T_CALL, '');
    line = line.replace(STRIP_LINE_TAIL, '');
    if (CYRILLIC_RUN.test(line)) {
      issues.push({ file: filePath, line: i + 1, content: raw.trim().slice(0, 120) });
    }
  }
  return issues;
}

// ─── JSON fix utilities ───────────────────────────────────────────────────────

/** Delete a leaf key at a dot-path and prune empty parent objects. */
function deleteDeep(obj, dotPath) {
  const parts = dotPath.split('.');
  const stack = [{ node: obj, key: null }];
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (next == null || typeof next !== 'object') return; // key doesn't exist
    stack.push({ node: cur, key: parts[i] });
    cur = next;
  }
  const last = parts[parts.length - 1];
  if (!(last in cur)) return;
  delete cur[last];
  // prune empty parent objects bottom-up (skip arrays — handled by pruneDeadCollections)
  for (let i = stack.length - 1; i >= 1; i--) {
    const { node, key } = stack[i];
    if (key && typeof node[key] === 'object' && !Array.isArray(node[key]) && Object.keys(node[key]).length === 0) {
      delete node[key];
    }
  }
}

/**
 * After individual leaf deletions, arrays can be left as [undefined, undefined, ...]
 * which JSON.stringify serialises as [null, null, ...].  Walk the tree recursively
 * and remove any array (or object) whose every leaf descendant is null/undefined,
 * then prune newly-empty parent objects bottom-up.
 *
 * Returns true if the node is now "dead" (should be deleted by its parent).
 */
function pruneDeadCollections(node) {
  if (node === null || node === undefined) return true;
  if (typeof node !== 'object') return false; // primitive — alive
  if (Array.isArray(node)) {
    // Mark sparse/null slots dead; recurse into object/array elements.
    let allDead = true;
    for (let i = 0; i < node.length; i++) {
      if (node[i] === null || node[i] === undefined) {
        // already dead
      } else if (typeof node[i] === 'object') {
        if (pruneDeadCollections(node[i])) {
          delete node[i]; // splice semantics: mark sparse
        } else {
          allDead = false;
        }
      } else {
        allDead = false; // live primitive
      }
    }
    return allDead;
  }
  // Plain object
  let allDead = true;
  for (const key of Object.keys(node)) {
    if (pruneDeadCollections(node[key])) {
      delete node[key];
    } else {
      allDead = false;
    }
  }
  return allDead;
}

// ─── Devkit helpers ───────────────────────────────────────────────────────────

/** Write JSON to stdout synchronously, then exit. Safe on pipes. */
function exitWithJson(obj) {
  writeSync(1, JSON.stringify(obj));
  process.exit(0);
}

function toDevkitIssue(file, line, msg) {
  return { check: 'i18n-check', severity: 'error', message: msg, file, line };
}

// ─── DEVKIT self-filter ───────────────────────────────────────────────────────

if (DEVKIT_MODE) {
  const pkgName = process.env.KB_DEVKIT_PACKAGE_NAME ?? '';
  const pkgDir  = process.env.KB_DEVKIT_PACKAGE_DIR  ?? '';

  if (pkgName !== '@kb-labs/web-site') {
    if (!HARDCODED_ONLY_PKGS.has(pkgName)) {
      exitWithJson({ issues: [] });
    }

    // Satellite package: HARDCODED check only.
    const dirs  = ['src', 'app', 'components'].map(d => join(pkgDir, d)).filter(existsSync);
    const files = dirs.flatMap(d => [...walk(d)]);
    const found = files.flatMap(f => extractHardcoded(f));

    exitWithJson({
      issues: found.map(({ file, line }) =>
        toDevkitIssue(file, line, '[HARDCODED] Raw Cyrillic text — use a prop/token or add // i18n-ignore')),
    });
  }
  // Falls through to full check for @kb-labs/web-site
}

// ─── Colors (standalone output) ───────────────────────────────────────────────

const c = NO_COLOR
  ? { red: s => s, yellow: s => s, green: s => s, gray: s => s, bold: s => s }
  : {
      red:    s => `\x1b[31m${s}\x1b[0m`,
      yellow: s => `\x1b[33m${s}\x1b[0m`,
      green:  s => `\x1b[32m${s}\x1b[0m`,
      gray:   s => `\x1b[90m${s}\x1b[0m`,
      bold:   s => `\x1b[1m${s}\x1b[0m`,
    };

// ─── Paths (web-site root) ────────────────────────────────────────────────────

const ROOT         = join(fileURLToPath(import.meta.url), '..', '..');
const MESSAGES_DIR = join(ROOT, 'messages');
const SOURCE_DIRS  = [join(ROOT, 'app'), join(ROOT, 'components')];

// ─── Load messages ────────────────────────────────────────────────────────────

function flattenKeys(obj, prefix = '', leavesOnly = false) {
  const out = new Set();
  const entries = Array.isArray(obj)
    ? obj.map((v, i) => [String(i), v])
    : Object.entries(obj);
  for (const [k, v] of entries) {
    const full = prefix ? `${prefix}.${k}` : k;
    const isLeaf = v === null || typeof v !== 'object';
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
  const p = join(MESSAGES_DIR, `${locale}.json`);
  if (!existsSync(p)) throw new Error(`Missing message file: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const enJson     = loadMessages('en');
const ruJson     = loadMessages('ru');
const enAllKeys  = flattenKeys(enJson, '', false);
const enLeafKeys = flattenKeys(enJson, '', true);
const ruLeafKeys = flattenKeys(ruJson, '', true);

// ─── Source files ─────────────────────────────────────────────────────────────

const sourceFiles = SOURCE_DIRS.flatMap(d => [...walk(d)]);

// ─── Extract t() key references ───────────────────────────────────────────────

function posToLineFn(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1);
  }
  return pos => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

const KEY_REGEX = /\bt(?:\.raw|\.rich)?\(\s*(['"])([^'"$`\n]+)\1/g;

// Detects namespace from getTranslations({ ..., namespace: 'X' }) or useTranslations('X')
const NS_REGEX = /(?:getTranslations\s*\(\s*\{[^}]*?namespace\s*:\s*['"]([^'"]+)['"]|useTranslations\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

function extractRefs(filePath) {
  const src    = readFileSync(filePath, 'utf8');
  const lineOf = posToLineFn(src);

  // Collect all namespaces declared in this file
  const namespaces = new Set();
  NS_REGEX.lastIndex = 0;
  let nsm;
  while ((nsm = NS_REGEX.exec(src)) !== null) {
    const ns = nsm[1] || nsm[2];
    if (ns) namespaces.add(ns);
  }
  // Single namespace → all t() keys are relative to it
  // Multiple namespaces in one file → can't reliably prefix, use as-is
  const singleNs   = namespaces.size === 1 ? [...namespaces][0] : null;
  const hasNs      = namespaces.size > 0;

  const refs = [];
  KEY_REGEX.lastIndex = 0;
  let m;
  while ((m = KEY_REGEX.exec(src)) !== null) {
    const key = m[2].trim();
    if (!key || key.startsWith('{')) continue;
    // Non-namespaced files: skip bare keys (no dot) to reduce false positives
    if (!hasNs && !key.includes('.')) continue;
    const fullKey = singleNs ? `${singleNs}.${key}` : key;
    refs.push({ key: fullKey, file: filePath, line: lineOf(m.index) });
  }
  return refs;
}

const allRefs = sourceFiles.flatMap(f => extractRefs(f));

const refsByKey = new Map();
for (const ref of allRefs) {
  if (!refsByKey.has(ref.key)) refsByKey.set(ref.key, []);
  refsByKey.get(ref.key).push({ file: ref.file, line: ref.line });
}

// ─── Nav-config derived key check ────────────────────────────────────────────
// SiteHeader renders nav items via template literals: t(`nav.megamenu.${item.key}.title`)
// Static regex can't resolve these — so we read nav-config.ts directly, extract
// every NavItem key string, and verify the expected message keys exist in en.json.

const NAV_CONFIG_FILE = join(ROOT, 'components', 'nav-config.ts');
const navDerivedRefs  = []; // { key, file, line }

if (existsSync(NAV_CONFIG_FILE)) {
  const navSrc = readFileSync(NAV_CONFIG_FILE, 'utf8');
  const lineOf = posToLineFn(navSrc);
  const NAV_ITEM_KEY_REGEX = /\bkey\s*:\s*['"]([^'"]+)['"]/g;
  let nm;
  while ((nm = NAV_ITEM_KEY_REGEX.exec(navSrc)) !== null) {
    const itemKey = nm[1];
    const line    = lineOf(nm.index);
    for (const suffix of ['title', 'description']) {
      navDerivedRefs.push({ key: `nav.megamenu.${itemKey}.${suffix}`, file: NAV_CONFIG_FILE, line });
    }
  }
}

// Register nav-derived refs so UNUSED check accounts for them too
for (const { key, file, line } of navDerivedRefs) {
  if (!refsByKey.has(key)) refsByKey.set(key, []);
  refsByKey.get(key).push({ file, line });
}

// ─── Run all checks ───────────────────────────────────────────────────────────

const missingInRu   = [...enLeafKeys].filter(k => !ruLeafKeys.has(k));
const extraInRu     = [...ruLeafKeys].filter(k => !enLeafKeys.has(k));

const missingRefs = [];
for (const [key, locs] of refsByKey) {
  if (!enAllKeys.has(key)) missingRefs.push({ key, locs });
}
missingRefs.sort((a, b) => a.key.localeCompare(b.key));

const hardcodedIssues = sourceFiles.flatMap(f => extractHardcoded(f));

// A leaf key is "covered" if any of its ancestors is referenced (e.g. via t.raw()).
// Deleting such keys would corrupt the object/array consumed by t.raw().
function isCoveredByAncestor(key) {
  const parts = key.split('.');
  for (let i = 1; i < parts.length; i++) {
    if (refsByKey.has(parts.slice(0, i).join('.'))) return true;
  }
  return false;
}

const unusedKeys = [...enLeafKeys].filter(k => !refsByKey.has(k) && !isCoveredByAncestor(k)).sort();

// ─── AUTOFIX: delete UNUSED keys from both JSON files ────────────────────────

if (FIX_MODE && unusedKeys.length > 0) {
  // Work on mutable copies so we can re-check after deletion.
  const enMut = JSON.parse(JSON.stringify(enJson));
  const ruMut = JSON.parse(JSON.stringify(ruJson));
  for (const key of unusedKeys) {
    deleteDeep(enMut, key);
    deleteDeep(ruMut, key);
  }
  // Prune arrays that became all-null after leaf deletions (sparse-array artifact).
  pruneDeadCollections(enMut);
  pruneDeadCollections(ruMut);
  const enPath = join(MESSAGES_DIR, 'en.json');
  const ruPath = join(MESSAGES_DIR, 'ru.json');
  if (DRY_RUN) {
    // no-op — standalone prints summary below; devkit prints nothing for dry-run
  } else {
    writeFileSync(enPath, JSON.stringify(enMut, null, 2) + '\n', 'utf8');
    writeFileSync(ruPath, JSON.stringify(ruMut, null, 2) + '\n', 'utf8');
  }

  // Devkit fix mode: return remaining issues (UNUSED are now gone).
  if (DEVKIT_FIX) {
    const remaining = [];
    for (const { key, locs } of missingRefs) {
      for (const loc of locs) {
        remaining.push(toDevkitIssue(loc.file, loc.line, `[MISSING] Key "${key}" referenced in code but absent from messages`));
      }
    }
    for (const { file, line } of hardcodedIssues) {
      remaining.push(toDevkitIssue(file, line, '[HARDCODED] Raw Cyrillic text — use t() or add // i18n-ignore'));
    }
    exitWithJson({ issues: remaining });
  }

  // Standalone fix mode: print summary and exit — don't show stale data.
  if (!DEVKIT_MODE) {
    const action = DRY_RUN ? 'Would remove' : 'Removed';
    console.log(`✅  ${action} ${unusedKeys.length} unused keys from en.json + ru.json`);
    process.exit(0);
  }
}

// ─── DEVKIT output (full check for @kb-labs/web-site) ────────────────────────

if (DEVKIT_MODE) {
  const issues = [];

  for (const k of missingInRu) {
    issues.push(toDevkitIssue(join(ROOT, 'messages', 'ru.json'), 0,
      `[MISMATCH] Key "${k}" present in en.json but missing from ru.json`));
  }
  for (const k of extraInRu) {
    issues.push(toDevkitIssue(join(ROOT, 'messages', 'en.json'), 0,
      `[MISMATCH] Key "${k}" present in ru.json but missing from en.json`));
  }
  for (const { key, locs } of missingRefs) {
    for (const loc of locs) {
      issues.push(toDevkitIssue(loc.file, loc.line,
        `[MISSING] Key "${key}" referenced in code but absent from messages`));
    }
  }
  for (const { file, line } of hardcodedIssues) {
    issues.push(toDevkitIssue(file, line,
      '[HARDCODED] Raw Cyrillic text — use t() or add // i18n-ignore'));
  }
  for (const key of unusedKeys) {
    issues.push({
      check: 'i18n-check',
      severity: 'warning',
      message: `[UNUSED] Key "${key}" in messages but never referenced in source`,
      file: join(ROOT, 'messages', 'en.json'),
      autoFix: true,
      fix: 'node sites/web/apps/web/scripts/i18n-check.mjs --fix',
    });
  }

  exitWithJson({ issues });
} else {

// ─── STANDALONE output ────────────────────────────────────────────────────────

let exitCode = 0;
const SEP  = '─'.repeat(64);
const NL   = () => console.log();
const LINE = () => console.log(c.gray(SEP));

NL();
console.log(c.bold('KB Labs i18n Check'));
LINE();
console.log(c.gray(`Messages : en.json (${enLeafKeys.size} leaf keys) · ru.json (${ruLeafKeys.size} leaf keys)`));
console.log(c.gray(`Source   : ${sourceFiles.length} files in app/ + components/`));
console.log(c.gray(`Refs     : ${refsByKey.size} unique keys referenced`));
NL();

// 1. MISMATCH
if (missingInRu.length > 0 || extraInRu.length > 0) {
  exitCode = 1;
  const total = missingInRu.length + extraInRu.length;
  console.log(c.red(c.bold(`❌  MISMATCH (${total}) — en.json and ru.json have different key sets`)));
  NL();
  if (missingInRu.length > 0) {
    console.log(c.red(`   Missing in ru.json (${missingInRu.length}):`));
    missingInRu.forEach(k => console.log(c.red(`     · ${k}`)));
    NL();
  }
  if (extraInRu.length > 0) {
    console.log(c.red(`   Extra in ru.json / missing in en.json (${extraInRu.length}):`));
    extraInRu.forEach(k => console.log(c.red(`     · ${k}`)));
    NL();
  }
} else {
  console.log(c.green('✅  MISMATCH  — en.json = ru.json key sets'));
  NL();
}

// 2. MISSING
if (missingRefs.length > 0) {
  exitCode = 1;
  console.log(c.red(c.bold(`❌  MISSING (${missingRefs.length}) — referenced in code, absent from messages`)));
  console.log(c.red('   These render as the raw key string or throw at runtime.'));
  NL();
  for (const { key, locs } of missingRefs) {
    console.log(c.red(`   ${key}`));
    locs.slice(0, 3).forEach(loc =>
      console.log(c.gray(`     ${relative(ROOT, loc.file)}:${loc.line}`)));
    if (locs.length > 3) console.log(c.gray(`     … and ${locs.length - 3} more`));
  }
  NL();
} else {
  console.log(c.green('✅  MISSING   — no missing keys'));
  NL();
}

// 3. HARDCODED
if (hardcodedIssues.length > 0) {
  exitCode = 1;
  console.log(c.red(c.bold(`❌  HARDCODED (${hardcodedIssues.length}) — Cyrillic text in .tsx not via t()`)));
  console.log(c.red('   Add // i18n-ignore to intentionally skip a line.'));
  NL();
  hardcodedIssues.forEach(({ file, line, content }) => {
    console.log(c.red(`   ${relative(ROOT, file)}:${line}`));
    console.log(c.gray(`     ${content}`));
  });
  NL();
} else {
  console.log(c.green('✅  HARDCODED — no raw Cyrillic text found in .tsx'));
  NL();
}

// 4. UNUSED
if (unusedKeys.length > 0) {
  if (STRICT) exitCode = 1;
  const icon  = STRICT ? c.red('❌') : c.yellow('⚠️ ');
  const label = STRICT
    ? `UNUSED (${unusedKeys.length}) — in messages but never referenced [strict]`
    : `UNUSED (${unusedKeys.length}) — in messages but never referenced`;
  console.log(`${icon}  ${c.bold(label)}`);
  if (!STRICT) {
    console.log(c.yellow('   Dynamic template-literal keys are excluded from analysis.'));
    console.log(c.yellow('   Run with --strict to make this fatal.\n'));
  } else {
    NL();
  }
  unusedKeys.forEach(k => console.log(STRICT ? c.red(`   · ${k}`) : c.yellow(`   · ${k}`)));
  NL();
} else {
  console.log(c.green('✅  UNUSED    — every messages key is referenced'));
  NL();
}

// Summary
LINE();
if (exitCode === 0 && unusedKeys.length === 0) {
  console.log(c.green(c.bold('✅  All checks passed — i18n is clean.')));
} else if (exitCode === 0) {
  console.log(
    c.green('✅  No fatal errors.') +
    c.yellow(`  (${unusedKeys.length} unused — run --strict to enforce)`),
  );
} else {
  const parts = [
    missingInRu.length + extraInRu.length > 0 && `${missingInRu.length + extraInRu.length} MISMATCH`,
    missingRefs.length > 0                    && `${missingRefs.length} MISSING`,
    hardcodedIssues.length > 0                && `${hardcodedIssues.length} HARDCODED`,
    STRICT && unusedKeys.length > 0           && `${unusedKeys.length} UNUSED`,
  ].filter(Boolean).join(' · ');
  console.log(c.red(c.bold(`❌  Failed: ${parts}`)));
}
NL();

process.exit(exitCode);
} // end else (DEVKIT_MODE)
