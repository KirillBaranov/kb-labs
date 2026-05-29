#!/usr/bin/env node
/**
 * docs-staleness.mjs — find doc pages affected by changed code files
 *
 * Input:  CHANGED_FILES env var — newline-separated paths relative to repo root
 * Output: JSON to stdout:
 *   {
 *     affected: [
 *       { slug, type, docPath, stalenessRisk, matchedFile, matchedOwner }
 *     ]
 *   }
 *
 * Standalone: CHANGED_FILES="plugins/workflow/core/executor.ts" node docs-staleness.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cwd = process.cwd();
const sitemapPath = join(cwd, 'sitemap.config.json');

function ownerMatches(ownerGlob, filePath) {
  // Patterns are like "plugins/workflow/**" or "core/platform/**"
  // Strip trailing /** and check prefix match
  const base = ownerGlob.replace(/\/\*\*$/, '').replace(/\*\*$/, '');
  return filePath === base || filePath.startsWith(base + '/');
}

function collectPages(sitemap) {
  const pages = [];
  for (const section of sitemap.sections ?? []) {
    for (const page of section.pages ?? []) {
      pages.push({
        ...page,
        type: page.type ?? section.type,
        stalenessRisk: page.stalenessRisk ?? section.stalenessRisk ?? 'medium',
      });
    }
    for (const sub of section.subsections ?? []) {
      for (const page of sub.pages ?? []) {
        pages.push({
          ...page,
          type: page.type ?? sub.type ?? section.type,
          stalenessRisk: page.stalenessRisk ?? sub.stalenessRisk ?? section.stalenessRisk ?? 'medium',
        });
      }
    }
  }
  return pages;
}

function slugToDocPath(slug) {
  // Convert slug to URL path: sdk/plugin-api/index → /docs/sdk/plugin-api
  const withoutIndex = slug.replace(/\/index$/, '');
  return `/docs/${withoutIndex}`;
}

function main() {
  const changedFilesRaw = process.env.CHANGED_FILES ?? '';
  const changedFiles = changedFilesRaw
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);

  if (changedFiles.length === 0) {
    process.stdout.write(JSON.stringify({ affected: [] }));
    process.exit(0);
  }

  if (!existsSync(sitemapPath)) {
    process.stderr.write('sitemap.config.json not found\n');
    process.exit(1);
  }

  const sitemap = JSON.parse(readFileSync(sitemapPath, 'utf-8'));
  const pages = collectPages(sitemap);

  // For each changed file, find the most-specific owner match per doc page.
  // "Most specific" = longest owner prefix (e.g. plugins/workflow/core/** beats plugins/workflow/**).
  // This prevents broad patterns from flooding unrelated pages.
  const affectedMap = new Map(); // slug → entry

  for (const file of changedFiles) {
    // Collect all (page, owner) matches for this file, scored by specificity
    const matches = [];
    for (const page of pages) {
      if (!page.owners?.length) continue;
      if (page.type === 'auto') continue;

      for (const owner of page.owners) {
        if (ownerMatches(owner, file)) {
          const specificity = owner.replace(/\/\*\*$/, '').split('/').length;
          matches.push({ page, owner, specificity });
          break; // one owner per page is enough
        }
      }
    }

    // For each file, only report pages whose owner is within 1 level of the most specific match.
    // E.g. if sdk/sdk/src/command/** matches (specificity 4), drop pages only matched by sdk/** (specificity 1).
    if (matches.length === 0) continue;
    const maxSpec = Math.max(...matches.map(m => m.specificity));
    const threshold = maxSpec - 1; // allow one level of broadness

    for (const { page, owner, specificity } of matches) {
      if (specificity < threshold) continue;

      if (!affectedMap.has(page.slug)) {
        affectedMap.set(page.slug, {
          slug: page.slug,
          type: page.type,
          docPath: slugToDocPath(page.slug),
          stalenessRisk: page.stalenessRisk,
          matchedFiles: [],
          matchedOwner: owner,
          specificity,
        });
      }
      const entry = affectedMap.get(page.slug);
      if (!entry.matchedFiles.includes(file)) entry.matchedFiles.push(file);
      if (specificity > entry.specificity) {
        entry.matchedOwner = owner;
        entry.specificity = specificity;
      }
    }
  }

  const affected = [...affectedMap.values()].sort((a, b) => {
    const risk = { high: 0, medium: 1, low: 2 };
    return (risk[a.stalenessRisk] ?? 1) - (risk[b.stalenessRisk] ?? 1);
  });

  process.stdout.write(JSON.stringify({ affected }, null, 2));
}

main();
