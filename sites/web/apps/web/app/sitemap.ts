import type { MetadataRoute } from 'next';

import { listBlogPosts } from '@/lib/content';

const SITE_URL = 'https://kblabs.ru';

const staticRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]['changeFrequency'] }> = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/install', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/product', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/product/workflows', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/product/plugins', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/state-broker', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/product/studio', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/release-automation', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/code-quality', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/code-intelligence', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/gateway', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/monorepo-ops', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/observability', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/solutions/platform-api', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/kb-deploy', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/kb-dev', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/kb-devkit', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/kb-monitor', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/marketplace', priority: 0.7, changeFrequency: 'weekly' },
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

  for (const { path, priority, changeFrequency } of staticRoutes) {
    entries.push({
      url: `${SITE_URL}/ru${path}`,
      alternates: {
        languages: {
          ru: `${SITE_URL}/ru${path}`,
          en: `${SITE_URL}/en${path}`,
          'x-default': `${SITE_URL}/en${path}`,
        },
      },
      changeFrequency,
      priority,
    });
  }

  const posts = listBlogPosts('en').filter((p) => !p.frontmatter.draft);
  for (const post of posts) {
    entries.push({
      url: `${SITE_URL}/ru/blog/${post.slug}`,
      alternates: {
        languages: {
          ru: `${SITE_URL}/ru/blog/${post.slug}`,
          en: `${SITE_URL}/en/blog/${post.slug}`,
          'x-default': `${SITE_URL}/en/blog/${post.slug}`,
        },
      },
      lastModified: post.frontmatter.date ? new Date(post.frontmatter.date) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}
