import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import type { NavGroup, NavItem } from '@/nav.config';

const contentRoot = path.resolve(process.cwd(), 'content');

type GroupMeta = {
  title?: string;
  order?: number;
  hidden?: boolean;
};

type PageMeta = {
  title?: string;
  description?: string;
  order?: number;
  hidden?: boolean;
};

/**
 * Humanize a file/directory name: "rest-api" → "REST API", "workflow-engine" → "Workflow Engine".
 * Keeps common acronyms uppercase.
 */
function humanize(name: string): string {
  const acronyms = new Set(['api', 'cli', 'sdk', 'rest', 'url', 'ui', 'id', 'llm', 'ci', 'cd']);
  return name
    .split('-')
    .map((part) => (acronyms.has(part.toLowerCase()) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

/** Read optional `_meta.json` in a directory. */
function readDirMeta(dirAbs: string): GroupMeta {
  const metaPath = path.join(dirAbs, '_meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as GroupMeta;
  } catch {
    return {};
  }
}

/** Read frontmatter from an MDX file without compiling it. */
function readPageMeta(fileAbs: string): PageMeta {
  try {
    const raw = fs.readFileSync(fileAbs, 'utf8');
    return (matter(raw).data ?? {}) as PageMeta;
  } catch {
    return {};
  }
}

/** Build a single NavItem from an .mdx file (or `dir/index.mdx`). */
function fileToItem(relSlug: string[], fileAbs: string, fallbackLabel: string): { item: NavItem; order: number; hidden: boolean } {
  const meta = readPageMeta(fileAbs);
  const label = meta.title ?? humanize(fallbackLabel);
  const href = '/' + relSlug.join('/');
  return {
    item: { label, href },
    order: meta.order ?? Number.POSITIVE_INFINITY,
    hidden: meta.hidden === true,
  };
}

/** Walk a top-level directory and collect NavItems (flat, one level deep — nested dirs get their own index page). */
function collectGroupItems(groupDirAbs: string, groupSlug: string): NavItem[] {
  const entries = fs.readdirSync(groupDirAbs, { withFileTypes: true });
  const items: Array<{ item: NavItem; order: number; hidden: boolean }> = [];

  // 1. index.mdx of the group itself is the group landing page
  const indexPath = path.join(groupDirAbs, 'index.mdx');
  if (fs.existsSync(indexPath)) {
    const { item, order, hidden } = fileToItem([groupSlug], indexPath, 'Overview');
    if (!hidden) {
      // Force landing to sort first unless explicitly ordered
      items.push({ item, order: order === Number.POSITIVE_INFINITY ? -1 : order, hidden });
    }
  }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    if (entry.isFile() && entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
      const base = entry.name.replace(/\.mdx$/, '');
      const fileAbs = path.join(groupDirAbs, entry.name);
      items.push(fileToItem([groupSlug, base], fileAbs, base));
      continue;
    }

    if (entry.isDirectory()) {
      // Nested directory: use its index.mdx as an item in the parent group
      const nestedIndex = path.join(groupDirAbs, entry.name, 'index.mdx');
      if (fs.existsSync(nestedIndex)) {
        items.push(fileToItem([groupSlug, entry.name], nestedIndex, entry.name));
      }
    }
  }

  return items
    .filter((entry) => !entry.hidden)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.item.label.localeCompare(b.item.label);
    })
    .map((entry) => entry.item);
}

/**
 * Walk `content/` and build the navigation tree.
 *
 * Rules:
 *   - Top-level `.mdx` files become items in a "Start Here" group (if no _meta.json overrides).
 *   - Top-level directories become NavGroups; their title comes from `_meta.json` or humanized dir name.
 *   - Inside each group: `.mdx` files become items; nested dirs are represented by their `index.mdx`.
 *   - Pages and groups can set `order` in frontmatter / `_meta.json` for explicit sorting.
 *   - Any file or directory with `hidden: true` is skipped.
 */
export function buildNavFromContent(): NavGroup[] {
  if (!fs.existsSync(contentRoot)) return [];

  const entries = fs.readdirSync(contentRoot, { withFileTypes: true });

  const topLevelItems: Array<{ item: NavItem; order: number; hidden: boolean }> = [];
  const groups: Array<{ group: NavGroup; order: number; hidden: boolean }> = [];

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    // Top-level MDX file (except index.mdx which is the site homepage)
    if (entry.isFile() && entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
      const base = entry.name.replace(/\.mdx$/, '');
      const fileAbs = path.join(contentRoot, entry.name);
      topLevelItems.push(fileToItem([base], fileAbs, base));
      continue;
    }

    if (entry.isDirectory()) {
      const groupDirAbs = path.join(contentRoot, entry.name);
      const meta = readDirMeta(groupDirAbs);
      if (meta.hidden) continue;

      const items = collectGroupItems(groupDirAbs, entry.name);
      if (items.length === 0) continue;

      groups.push({
        group: {
          title: meta.title ?? humanize(entry.name),
          items,
        },
        order: meta.order ?? Number.POSITIVE_INFINITY,
        hidden: false,
      });
    }
  }

  const result: NavGroup[] = [];

  if (topLevelItems.length > 0) {
    const sortedTop = topLevelItems
      .filter((e) => !e.hidden)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.item.label.localeCompare(b.item.label);
      })
      .map((e) => e.item);
    result.push({ title: 'Start Here', items: sortedTop });
  }

  groups
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.group.title.localeCompare(b.group.title);
    })
    .forEach((g) => result.push(g.group));

  return result;
}
