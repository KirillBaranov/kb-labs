import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';

export type Lang = 'en' | 'ru';

type Frontmatter = {
  title: string;
  description: string;
  lang: Lang;
  slug: string;
  date?: string;
  tags?: string[];
  draft?: boolean;
  author?: string;
};

const contentRoot = path.resolve(process.cwd(), '../../content');

function readMdxFrom(baseDir: string, lang: Lang, slug: string) {
  const fullPath = path.join(baseDir, lang, `${slug}.mdx`);
  return fs.readFileSync(fullPath, 'utf8');
}

export async function getWebPage(lang: Lang, slug: string) {
  const raw = readMdxFrom(path.join(contentRoot, 'web'), lang, slug);
  const { content, data } = matter(raw);
  const compiled = await compileMDX<Frontmatter>({
    source: content,
    options: { parseFrontmatter: false },
  });

  return {
    frontmatter: data as Frontmatter,
    content: compiled.content,
  };
}

export function listBlogPosts(lang: Lang) {
  const dir = path.join(contentRoot, 'blog', lang);
  const entries = fs.readdirSync(dir).filter((item) => item.endsWith('.mdx'));

  return entries
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '');
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data } = matter(raw);
      return { slug, frontmatter: data as Frontmatter };
    })
    .sort((a, b) => (a.frontmatter.date && b.frontmatter.date ? (a.frontmatter.date < b.frontmatter.date ? 1 : -1) : 0));
}

export async function getBlogPost(lang: Lang, slug: string) {
  const raw = readMdxFrom(path.join(contentRoot, 'blog'), lang, slug);
  const { content, data } = matter(raw);
  const compiled = await compileMDX<Frontmatter>({
    source: content,
    options: { parseFrontmatter: false },
  });

  return {
    frontmatter: data as Frontmatter,
    content: compiled.content,
  };
}
