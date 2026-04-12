import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export type SearchRecord = {
  slug: string;
  title: string;
  description: string;
  body: string;
};

const contentRoot = path.resolve(process.cwd(), 'content');

function collectMdxFiles(dir: string, base = ''): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.mdx')) {
      files.push(rel);
    }
  }
  return files;
}

function fileToSlug(rel: string): string {
  return rel
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '');
}

function stripMdx(content: string): string {
  return content
    // remove frontmatter (already stripped by gray-matter, but just in case)
    .replace(/^---[\s\S]*?---/, '')
    // remove JSX components/tags
    .replace(/<[^>]+>/g, ' ')
    // remove code blocks (keep some context)
    .replace(/```[\s\S]*?```/g, ' ')
    // remove inline code
    .replace(/`[^`]+`/g, ' ')
    // remove markdown links/images
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // remove bold/italic
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  const files = collectMdxFiles(contentRoot);
  const records: SearchRecord[] = [];

  for (const rel of files) {
    const raw = fs.readFileSync(path.join(contentRoot, rel), 'utf8');
    const { content, data } = matter(raw);

    if (data.hidden) continue;

    const slug = fileToSlug(rel);
    const body = stripMdx(content);

    records.push({
      slug: slug ? `/${slug}` : '/',
      title: (data.title as string) ?? slug,
      description: (data.description as string) ?? '',
      body,
    });
  }

  return NextResponse.json(records, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
