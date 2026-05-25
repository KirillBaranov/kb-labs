import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';

import { listBlogPosts } from '@/lib/content';

const SITE_URL = 'https://kblabs.ru';
const BUILD_DATE = new Date();
const CONTENT_ROOT = path.resolve(process.cwd(), '../../content');

const staticRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]['changeFrequency'] }> = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/install', priority: 0.9, changeFrequency: 'monthly' },
  // Product pages — real URL structure under /product/
  { path: '/product/workflows', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/product/plugins', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/state-broker', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/studio', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/gateway', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/kb-deploy', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/kb-dev', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/kb-devkit', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/kb-monitor', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/marketplace', priority: 0.7, changeFrequency: 'weekly' },
  // Solutions
  { path: '/solutions/release-automation', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/code-quality', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/code-intelligence', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/monorepo-ops', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/observability', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/platform-api', priority: 0.8, changeFrequency: 'monthly' },
  // Content & marketing
  { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/changelog', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/compare', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/use-cases', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/roadmap', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/enterprise', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const { path: routePath, priority, changeFrequency } of staticRoutes) {
    entries.push({
      url: `${SITE_URL}/ru${routePath}`,
      lastModified: BUILD_DATE,
      alternates: {
        languages: {
          ru: `${SITE_URL}/ru${routePath}`,
          en: `${SITE_URL}/en${routePath}`,
          'x-default': `${SITE_URL}${routePath}`,
        },
      },
      changeFrequency,
      priority,
    });
  }

  const posts = listBlogPosts('en').filter((p) => !p.frontmatter.draft);
  for (const post of posts) {
    const ruExists = fs.existsSync(path.join(CONTENT_ROOT, 'blog', 'ru', `${post.slug}.mdx`));
    entries.push({
      url: `${SITE_URL}/ru/blog/${post.slug}`,
      lastModified: post.frontmatter.date ? new Date(post.frontmatter.date) : BUILD_DATE,
      alternates: {
        languages: {
          ...(ruExists ? { ru: `${SITE_URL}/ru/blog/${post.slug}` } : {}),
          en: `${SITE_URL}/en/blog/${post.slug}`,
          'x-default': `${SITE_URL}/blog/${post.slug}`,
        },
      },
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}
