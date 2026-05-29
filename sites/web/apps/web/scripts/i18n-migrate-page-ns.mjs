#!/usr/bin/env node
/**
 * i18n-migrate-page-ns.mjs
 *
 * Phase B: migrates pages from the legacy `page` namespace to per-page
 * clean namespaces.
 *
 * For each page:
 *   1. Rewrites messages/<locale>/X.json from
 *        { page: { prefixedKey: value } }
 *      to
 *        { newNamespace: { cleanKey: value } }
 *   2. Updates the page.tsx file:
 *        - namespace: 'page' → namespace: 'newNamespace'
 *        - t('prefixedKey') → t('cleanKey')
 *        - t.raw('prefixedKey') → t.raw('cleanKey')
 *        - en.json monolithic file references if any
 *
 * Key transformation: strip prefix + lowercase first char
 *   kbdevHeroTitle (prefix: kbdev) → heroTitle
 *   cmpCtaTitle    (prefix: cmp)   → ctaTitle
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MESSAGES_DIR = join(ROOT, 'messages');
const APP_DIR = join(ROOT, 'app', '[locale]');

// ── Config ────────────────────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    file: 'contact.json',
    pagePath: 'contact',
    prefix: 'contact',
    newNamespace: 'contact',
  },
  {
    file: 'compare.json',
    pagePath: 'compare',
    prefix: 'cmp',
    newNamespace: 'compare',
  },
  {
    file: 'security.json',
    pagePath: 'security',
    prefix: 'sec',
    newNamespace: 'security',
  },
  {
    file: 'use-cases.json',
    pagePath: 'use-cases',
    prefix: 'uc',
    newNamespace: 'useCases',
  },
  {
    file: 'product/kb-dev.json',
    pagePath: 'product/kb-dev',
    prefix: 'kbdev',
    newNamespace: 'kbDev',
  },
  {
    file: 'product/kb-devkit.json',
    pagePath: 'product/kb-devkit',
    prefix: 'devkit',
    newNamespace: 'kbDevkit',
  },
  {
    file: 'product/kb-monitor.json',
    pagePath: 'product/kb-monitor',
    prefix: 'mon',
    newNamespace: 'kbMonitor',
  },
  {
    file: 'product/kb-deploy.json',
    pagePath: 'product/kb-deploy',
    prefix: 'deploy',
    newNamespace: 'kbDeploy',
  },
  {
    file: 'product/plugins.json',
    pagePath: 'product/plugins',
    prefix: 'plug',
    newNamespace: 'plugins',
  },
  {
    file: 'product/gateway.json',
    pagePath: 'product/gateway',
    prefix: 'gw',
    newNamespace: 'gateway',
  },
  {
    file: 'product/state-broker.json',
    pagePath: 'product/state-broker',
    prefix: 'state',
    newNamespace: 'stateBroker',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripPrefix(key, prefix) {
  if (!key.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const rest = key.slice(prefix.length);
  if (!rest) return null; // key IS the prefix with nothing after
  return rest.charAt(0).toLowerCase() + rest.slice(1);
}

function transformMessages(oldData, prefix, newNamespace) {
  // oldData is either { page: { prefixedKey: value } } (Phase A format)
  // or { page: { ... } } from the monolithic split
  const pageData = oldData['page'] ?? oldData;
  const clean = {};
  const keyMap = {}; // prefixedKey → cleanKey (for page.tsx rewrite)

  for (const [key, value] of Object.entries(pageData)) {
    const cleanKey = stripPrefix(key, prefix);
    if (cleanKey === null) {
      // Key doesn't start with prefix — keep as-is (shouldn't happen if split was correct)
      console.warn(`  ⚠  key '${key}' doesn't start with prefix '${prefix}' — keeping as-is`);
      clean[key] = value;
      keyMap[key] = key;
    } else {
      clean[cleanKey] = value;
      keyMap[key] = cleanKey;
    }
  }

  return { transformed: { [newNamespace]: clean }, keyMap };
}

function rewritePageFile(pagePath, prefix, newNamespace, keyMap) {
  const filePath = join(APP_DIR, pagePath, 'page.tsx');
  if (!existsSync(filePath)) {
    console.warn(`  ⚠  page.tsx not found: ${filePath}`);
    return false;
  }

  let src = readFileSync(filePath, 'utf8');
  const original = src;

  // Pattern A: explicit namespace declaration
  //   namespace: 'page' → namespace: 'newNamespace'
  src = src.replace(/namespace:\s*'page'/g, `namespace: '${newNamespace}'`);
  src = src.replace(/namespace:\s*"page"/g, `namespace: "${newNamespace}"`);

  // Pattern B: no namespace, getTranslations({ locale }) with t('page.prefixedKey')
  //   Replace getTranslations({ locale }) → getTranslations({ locale, namespace: 'ns' })
  //   but ONLY if the page uses dot-path keys (check for presence of t('page.prefix)
  const usesDotPath = src.includes(`t('page.${prefix}`) || src.includes(`t("page.${prefix}`);
  if (usesDotPath) {
    // Add namespace to all getTranslations calls that don't have one
    src = src.replace(
      /getTranslations\(\{\s*locale\s*\}\)/g,
      `getTranslations({ locale, namespace: '${newNamespace}' })`,
    );
    src = src.replace(
      /getTranslations\(\{\s*locale:\s*(\w+)\s*\}\)/g,
      `getTranslations({ locale: $1, namespace: '${newNamespace}' })`,
    );
  }

  // Sort by key length descending to avoid partial matches
  const sortedKeys = Object.keys(keyMap).sort((a, b) => b.length - a.length);

  for (const oldKey of sortedKeys) {
    const newKey = keyMap[oldKey];
    if (oldKey === newKey) continue;

    // Pattern A keys: t('prefixedKey') → t('cleanKey')
    const patterns = [
      [new RegExp(`t\\('${escapeRegex(oldKey)}'`, 'g'), `t('${newKey}'`],
      [new RegExp(`t\\("${escapeRegex(oldKey)}"`, 'g'), `t("${newKey}"`],
      [new RegExp(`t\\.raw\\('${escapeRegex(oldKey)}'`, 'g'), `t.raw('${newKey}'`],
      [new RegExp(`t\\.raw\\("${escapeRegex(oldKey)}"`, 'g'), `t.raw("${newKey}"`],
    ];

    // Pattern B keys: t('page.prefixedKey') → t('cleanKey')
    if (usesDotPath) {
      patterns.push(
        [new RegExp(`t\\('page\\.${escapeRegex(oldKey)}'`, 'g'), `t('${newKey}'`],
        [new RegExp(`t\\("page\\.${escapeRegex(oldKey)}"`, 'g'), `t("${newKey}"`],
        [new RegExp(`t\\.raw\\('page\\.${escapeRegex(oldKey)}'`, 'g'), `t.raw('${newKey}'`],
        [new RegExp(`t\\.raw\\("page\\.${escapeRegex(oldKey)}"`, 'g'), `t.raw("${newKey}"`],
      );
    }

    for (const [pattern, replacement] of patterns) {
      src = src.replace(pattern, replacement);
    }
  }

  if (src === original) {
    console.log(`  skip  ${pagePath}/page.tsx  — no changes needed`);
    return false;
  }

  writeFileSync(filePath, src, 'utf8');
  return true;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Main ──────────────────────────────────────────────────────────────────────

let totalChanges = 0;

for (const { file, pagePath, prefix, newNamespace } of MIGRATIONS) {
  console.log(`\n── ${pagePath}  (namespace: ${newNamespace})  ──`);

  let anyChange = false;

  // Build key map from en chunk (canonical)
  const enChunkPath = join(MESSAGES_DIR, 'en', file);
  if (!existsSync(enChunkPath)) {
    console.warn(`  ⚠  chunk not found: ${enChunkPath}`);
    continue;
  }
  const enChunk = JSON.parse(readFileSync(enChunkPath, 'utf8'));
  const { transformed: enTransformed, keyMap } = transformMessages(enChunk, prefix, newNamespace);

  const keyCount = Object.keys(keyMap).length;
  console.log(`  keys: ${keyCount}  (prefix: '${prefix}' → namespace: '${newNamespace}')`);

  // Rewrite chunk files for all locales
  for (const locale of ['en', 'ru']) {
    const chunkPath = join(MESSAGES_DIR, locale, file);
    if (!existsSync(chunkPath)) {
      console.warn(`  ⚠  ${locale}/${file} not found`);
      continue;
    }

    const chunkData = JSON.parse(readFileSync(chunkPath, 'utf8'));
    const { transformed } = transformMessages(chunkData, prefix, newNamespace);

    writeFileSync(chunkPath, JSON.stringify(transformed, null, 2) + '\n', 'utf8');
    console.log(`  ✓  messages/${locale}/${file}  →  { ${newNamespace}: { ${keyCount} keys } }`);
    anyChange = true;
  }

  // Rewrite page.tsx
  const pageChanged = rewritePageFile(pagePath, prefix, newNamespace, keyMap);
  if (pageChanged) {
    console.log(`  ✓  app/[locale]/${pagePath}/page.tsx  (${keyCount} key renames)`);
    anyChange = true;
  }

  if (anyChange) totalChanges++;
}

console.log(`\n✅  Phase B complete — migrated ${totalChanges} pages off legacy 'page' namespace.`);
console.log('   Run: pnpm typecheck  to verify.');
