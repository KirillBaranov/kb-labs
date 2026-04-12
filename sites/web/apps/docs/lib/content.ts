import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypePrettyCode, { type Options as PrettyCodeOptions } from 'rehype-pretty-code';
import remarkGfm from 'remark-gfm';

import { MdxComponents } from '@/components/MdxComponents';

const prettyCodeOptions: PrettyCodeOptions = {
  theme: 'github-dark-dimmed',
  keepBackground: true,
  defaultLang: 'plaintext',
  // Don't apply theme colors to inline code — we style it ourselves in CSS
  bypassInlineCode: true,
};

export type Frontmatter = {
  title: string;
  description?: string;
  updatedAt?: string;
  /** Sort order within its nav group (lower = earlier). Defaults to +Infinity → alphabetical. */
  order?: number;
  /** If true, page is excluded from the sidebar navigation. */
  hidden?: boolean;
};

const contentRoot = path.resolve(process.cwd(), 'content');

/** Resolves slug array → file path, trying both <slug>.mdx and <slug>/index.mdx */
function resolveFilePath(slugParts: string[]): string | null {
  const base = path.join(contentRoot, ...slugParts);
  if (fs.existsSync(`${base}.mdx`)) return `${base}.mdx`;
  if (fs.existsSync(path.join(base, 'index.mdx'))) return path.join(base, 'index.mdx');
  return null;
}

export async function getDocPage(slugParts: string[]) {
  const filePath = resolveFilePath(slugParts);

  if (!filePath) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const { content, data } = matter(raw);

  const compiled = await compileMDX<Frontmatter>({
    source: content,
    components: MdxComponents,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
      },
    },
  });

  return {
    frontmatter: data as Frontmatter,
    content: compiled.content,
  };
}

/** Extract h2/h3 headings from raw MDX for ToC */
export function extractHeadings(slugParts: string[]): { id: string; text: string; level: 2 | 3 }[] {
  const filePath = resolveFilePath(slugParts);
  if (!filePath) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
  const { content } = matter(raw);

  const headings: { id: string; text: string; level: 2 | 3 }[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2) {
      const text = h2[1].trim();
      headings.push({ id: slugify(text), text, level: 2 });
    } else if (h3) {
      const text = h3[1].trim();
      headings.push({ id: slugify(text), text, level: 3 });
    }
  }

  return headings;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
