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

function humanize(name: string): string {
  const acronyms = new Set(['api', 'cli', 'sdk', 'rest', 'url', 'ui', 'id', 'llm', 'ci', 'cd']);
  return name
    .split('-')
    .map((part) => (acronyms.has(part.toLowerCase()) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function readDirMeta(dirAbs: string): GroupMeta {
  const metaPath = path.join(dirAbs, '_meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as GroupMeta;
  } catch {
    return {};
  }
}

function readPageMeta(fileAbs: string): PageMeta {
  try {
    const raw = fs.readFileSync(fileAbs, 'utf8');
    return (matter(raw).data ?? {}) as PageMeta;
  } catch {
    return {};
  }
}

function pageExistsInLocale(localeDir: string, relSlug: string[]): boolean {
  const base = path.join(contentRoot, localeDir, ...relSlug);
  return fs.existsSync(`${base}.mdx`) || fs.existsSync(path.join(base, 'index.mdx'));
}

function fileToItem(
  locale: string,
  relSlug: string[],
  fileAbs: string,
  fallbackLabel: string,
): { item: NavItem; order: number; hidden: boolean } {
  const meta = readPageMeta(fileAbs);
  const label = meta.title ?? humanize(fallbackLabel);
  const href = `/${locale}/` + relSlug.join('/');
  const untranslated = locale !== 'en' && !pageExistsInLocale(locale, relSlug);
  return {
    item: { label, href, untranslated },
    order: meta.order ?? Number.POSITIVE_INFINITY,
    hidden: meta.hidden === true,
  };
}

function collectGroupItems(locale: string, groupDirAbs: string, groupSlug: string): NavItem[] {
  const entries = fs.readdirSync(groupDirAbs, { withFileTypes: true });
  const items: Array<{ item: NavItem; order: number; hidden: boolean }> = [];

  const indexPath = path.join(groupDirAbs, 'index.mdx');
  if (fs.existsSync(indexPath)) {
    const { item, order, hidden } = fileToItem(locale, [groupSlug], indexPath, 'Overview');
    if (!hidden) {
      items.push({ item, order: order === Number.POSITIVE_INFINITY ? -1 : order, hidden });
    }
  }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    if (entry.isFile() && entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
      const base = entry.name.replace(/\.mdx$/, '');
      const fileAbs = path.join(groupDirAbs, entry.name);
      items.push(fileToItem(locale, [groupSlug, base], fileAbs, base));
      continue;
    }

    if (entry.isDirectory()) {
      const nestedIndex = path.join(groupDirAbs, entry.name, 'index.mdx');
      if (fs.existsSync(nestedIndex)) {
        items.push(fileToItem(locale, [groupSlug, entry.name], nestedIndex, entry.name));
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
 * Build nav for the given locale.
 * Falls back to reading `content/en/` for structure; marks items without locale translation.
 */
export function buildNavFromContent(locale: string): NavGroup[] {
  // Always read structure from 'en' as the source of truth for what pages exist
  const enRoot = path.join(contentRoot, 'en');
  if (!fs.existsSync(enRoot)) return [];

  const entries = fs.readdirSync(enRoot, { withFileTypes: true });

  const topLevelItems: Array<{ item: NavItem; order: number; hidden: boolean }> = [];
  const groups: Array<{ group: NavGroup; order: number; hidden: boolean }> = [];

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    if (entry.isFile() && entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
      const base = entry.name.replace(/\.mdx$/, '');
      const fileAbs = path.join(enRoot, entry.name);
      topLevelItems.push(fileToItem(locale, [base], fileAbs, base));
      continue;
    }

    if (entry.isDirectory()) {
      const groupDirAbs = path.join(enRoot, entry.name);
      const meta = readDirMeta(groupDirAbs);
      if (meta.hidden) continue;

      const items = collectGroupItems(locale, groupDirAbs, entry.name);
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
