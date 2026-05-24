import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type SearchRecord = {
  slug: string;
  title: string;
  description: string;
  body: string;
};

const contentRoot = path.resolve(process.cwd(), 'content');

function collectMdxFiles(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.mdx')) {
      files.push(rel);
    }
  }
  return files;
}

function fileToSlug(locale: string, rel: string): string {
  const clean = rel
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '');
  return `/${locale}/${clean}`.replace(/\/$/, '') || `/${locale}`;
}

function stripMdx(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get('locale') ?? 'en';

  // Try locale dir first, fall back to 'en' for pages without translation
  const localeDir = path.join(contentRoot, locale);
  const enDir = path.join(contentRoot, 'en');

  const enFiles = collectMdxFiles(enDir);
  const localeFiles = new Set(collectMdxFiles(localeDir));

  const records: SearchRecord[] = [];

  for (const rel of enFiles) {
    // Use translated file if available, otherwise English fallback
    const sourceDir = localeFiles.has(rel) ? localeDir : enDir;
    const raw = fs.readFileSync(path.join(sourceDir, rel), 'utf8');
    const { content, data } = matter(raw);

    if (data.hidden) continue;

    const slug = fileToSlug(locale, rel);
    const body = stripMdx(content);

    records.push({
      slug,
      title: (data.title as string) ?? slug,
      description: (data.description as string) ?? '',
      body,
    });
  }

  return NextResponse.json(records, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
