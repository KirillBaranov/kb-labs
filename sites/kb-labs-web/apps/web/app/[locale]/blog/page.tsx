import type { Metadata } from 'next';

import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import s from './page.module.css';
import { buildPageMetadata } from '@/lib/page-metadata';


type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('blog.meta.title'),
    description: t('blog.meta.description'),
    path: '/blog',
    imageSegment: 'blog',
  });
}

// Placeholder posts — replace with real CMS/MDX source later
const POSTS = [
  {
    slug: 'open-the-closed',
    date: 'Jan 2026',
    tag: 'Philosophy',
    title: 'Open the closed: why vendor lock-in is a design choice, not a given',
    excerpt: 'Every platform dependency is a bet. We explain why we think the only safe bet is a typed contract — and how that shapes every architectural decision we make.',
  },
  {
    slug: 'plugin-system-v3',
    date: 'Dec 2025',
    tag: 'Engineering',
    title: 'How we redesigned the plugin system to eliminate circular dependencies',
    excerpt: 'Plugin runtimes that depend on the core they extend are a reliability time bomb. Here\'s how we broke the cycle using dynamic imports and a factory pattern.',
  },
  {
    slug: 'mind-rag-adaptive-weights',
    date: 'Nov 2025',
    tag: 'AI',
    title: 'Adaptive search weights in Mind RAG: moving from static to intent-aware retrieval',
    excerpt: 'BM25 + vector hybrid search works well on average. But "on average" hides a lot of variance. We added per-query adaptive weights to fix the tail cases.',
  },
  {
    slug: 'two-tier-memory',
    date: 'Nov 2025',
    tag: 'AI',
    title: 'Two-tier memory for long-running agents: working memory vs persistent facts',
    excerpt: 'As agent sessions get longer, context windows fill up. We built a two-tier memory system that keeps the important stuff and lets the noise fade.',
  },
  {
    slug: 'incremental-builds',
    date: 'Oct 2025',
    tag: 'DevEx',
    title: 'Going from 10-minute builds to 15-second incremental rebuilds in a 125-package monorepo',
    excerpt: 'Full rebuilds were killing developer flow. Here\'s the layer-based incremental build system we built into DevKit — and the unexpected edge cases we hit.',
  },
];

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>Blog</h1>
          <p>Engineering notes, platform updates, and thinking out loud.</p>
        </section>

        <div className={s.posts}>
          {POSTS.map((post) => (
            <Link key={post.slug} className={s.post} href={`/${locale}/blog/${post.slug}`}>
              <div className={s.postMeta}>
                <span className={s.postDate}>{post.date}</span>
                <span className={s.postTag}>{post.tag}</span>
              </div>
              <div className={s.postBody}>
                <h2 className={s.postTitle}>{post.title}</h2>
                <p className={s.postExcerpt}>{post.excerpt}</p>
                <span className={s.postReadmore}>Read more →</span>
              </div>
            </Link>
          ))}
        </div>

      </main>
      <SiteFooter />
    </>
  );
}
