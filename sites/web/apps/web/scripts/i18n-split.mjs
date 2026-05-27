#!/usr/bin/env node
/**
 * i18n-split.mjs
 *
 * Splits monolithic messages/en.json + messages/ru.json into per-namespace
 * chunk files under messages/en/ and messages/ru/.
 *
 * Convention:
 *   - URL path X  →  messages/<locale>/X.json  →  { [namespace]: { ... } }
 *   - _shared.json  →  { nav, footer, ui, notFound, meta }  (flat, always loaded)
 *
 * Pages still using the legacy `page` namespace keep their keys wrapped
 * as { page: { prefix+key: value } } so no page.tsx changes are needed in Phase A.
 * Phase B will rename these to clean namespaces.
 *
 * Safe to re-run: overwrites chunk files but never touches source en.json / ru.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MESSAGES_DIR = join(ROOT, 'messages');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeChunk(relPath, data) {
  const abs = join(MESSAGES_DIR, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  wrote  ${relPath}  (${Buffer.byteLength(JSON.stringify(data))}B)`);
}

// ── Shared keys (always loaded, needed by client components in layout) ────────
const SHARED_KEYS = ['nav', 'footer', 'ui', 'notFound', 'meta'];

// ── Clean namespace → chunk file mapping ──────────────────────────────────────
// These namespaces already exist as top-level keys in en.json and map 1-to-1
// to a URL path. The chunk file wraps the data in { [namespace]: data }.
const CLEAN_CHUNKS = [
  { file: 'home.json',       namespace: 'home' },
  { file: 'pricing.json',    namespace: 'pricing' },
  { file: 'about.json',      namespace: 'about' },
  { file: 'blog.json',       namespace: 'blog' },
  { file: 'changelog.json',  namespace: 'changelog' },
  { file: 'demo.json',       namespace: 'demo' },
  { file: 'enterprise.json', namespace: 'enterprise' },
  { file: 'install.json',    namespace: 'install' },
  { file: 'legal.json',      namespace: 'legal' },
  { file: 'roadmap.json',    namespace: 'roadmap' },
  { file: 'signup.json',     namespace: 'signup' },
  // solutions — already have proper namespaces
  { file: 'solutions/code-intelligence.json',  namespace: 'solutionCodeIntelligence' },
  { file: 'solutions/code-quality.json',       namespace: 'solutionCodeQuality' },
  { file: 'solutions/monorepo-ops.json',        namespace: 'solutionMonorepoOps' },
  { file: 'solutions/observability.json',       namespace: 'solutionObservability' },
  { file: 'solutions/platform-api.json',        namespace: 'solutionPlatformApi' },
  { file: 'solutions/release-automation.json',  namespace: 'solutionReleaseAutomation' },
  // product pages with proper namespaces
  { file: 'product/studio.json',     namespace: 'productStudio' },
  { file: 'product/workflows.json',  namespace: 'productWorkflows' },
  { file: 'product/marketplace.json', namespace: 'marketplace' },
];

// ── Legacy `page` namespace — split by key prefix ────────────────────────────
// Each entry extracts all keys from the `page` namespace whose names start
// with any of the given prefixes. The chunk file keeps them wrapped in
// { page: { prefix+key: value } } so page.tsx files need no changes (Phase A).
// Phase B will rename to clean namespaces.
const PAGE_SPLITS = [
  { file: 'contact.json',             prefixes: ['contact'] },
  { file: 'compare.json',             prefixes: ['cmp'] },
  { file: 'security.json',            prefixes: ['sec'] },
  { file: 'use-cases.json',           prefixes: ['uc'] },
  { file: 'product/kb-dev.json',      prefixes: ['kbdev'] },
  { file: 'product/kb-devkit.json',   prefixes: ['devkit'] },
  { file: 'product/kb-monitor.json',  prefixes: ['mon'] },
  { file: 'product/kb-deploy.json',   prefixes: ['deploy'] },
  { file: 'product/plugins.json',     prefixes: ['plug'] },
  { file: 'product/gateway.json',     prefixes: ['gw'] },
  { file: 'product/state-broker.json', prefixes: ['state'] },
];

// ── Main ──────────────────────────────────────────────────────────────────────

for (const locale of ['en', 'ru']) {
  const srcPath = join(MESSAGES_DIR, `${locale}.json`);
  if (!existsSync(srcPath)) {
    console.warn(`  skip  ${locale}.json — not found`);
    continue;
  }

  console.log(`\n── ${locale} ──`);
  const src = readJson(srcPath);

  // 1. _shared.json
  const shared = {};
  for (const key of SHARED_KEYS) {
    if (src[key] !== undefined) shared[key] = src[key];
  }
  writeChunk(`${locale}/_shared.json`, shared);

  // 2. Clean namespace chunks
  for (const { file, namespace } of CLEAN_CHUNKS) {
    if (src[namespace] === undefined) {
      console.log(`  skip  ${locale}/${file}  — key '${namespace}' not found in source`);
      continue;
    }
    writeChunk(`${locale}/${file}`, { [namespace]: src[namespace] });
  }

  // 3. Page namespace splits
  const pageNs = src['page'];
  if (!pageNs) {
    console.warn(`  skip  page splits — 'page' namespace not found`);
    continue;
  }

  for (const { file, prefixes } of PAGE_SPLITS) {
    const extracted = {};
    for (const [key, value] of Object.entries(pageNs)) {
      const matchedPrefix = prefixes.find((p) => key.toLowerCase().startsWith(p.toLowerCase()));
      if (matchedPrefix) {
        extracted[key] = value;
      }
    }
    if (Object.keys(extracted).length === 0) {
      console.log(`  skip  ${locale}/${file}  — no keys matched prefixes [${prefixes.join(', ')}]`);
      continue;
    }
    // Wrap in { page: { ... } } so page.tsx files need no changes (Phase A compat)
    writeChunk(`${locale}/${file}`, { page: extracted });
  }
}

console.log('\n✅  Done. messages/en/ and messages/ru/ are ready.');
console.log('   Next step: update i18n/request.ts and middleware.ts to use chunk loading.');
