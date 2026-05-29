// seo-ignore og-keys (blog OG image intentionally uses hero section text for visual impact)
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  AnimateOnScroll,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import { BlogControls } from './BlogControls';
import { BlogPagination } from './BlogPagination';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string; q?: string; page?: string }>;
};

const PAGE_SIZE = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

/** Ensure slug only contains URL-safe characters (filesystem-derived, but CodeQL-safe). */
function safeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-_]/g, '');
}

// ── Metadata ──────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tag = '', q = '', page: pageStr = '1' } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });
  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;

  const allPosts = listBlogPosts(lang).filter((p) => !p.frontmatter.draft);

  // Unique tags
  const allTags = Array.from(
    new Set(allPosts.map((p) => p.frontmatter.tag).filter(Boolean) as string[]),
  ).sort();

  // Filter server-side
  const query = q.trim().toLowerCase();
  const filtered = allPosts.filter((p) => {
    const matchTag = !tag || p.frontmatter.tag === tag;
    const matchQ =
      !query ||
      p.frontmatter.title.toLowerCase().includes(query) ||
      (p.frontmatter.excerpt ?? p.frontmatter.description ?? '').toLowerCase().includes(query);
    return matchTag && matchQ;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(pageStr, 10) || 1), totalPages);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const labels = {
    searchPlaceholder: t('blog.searchPlaceholder'),
    filterAll: t('blog.filterAll'),
    noResults: t('blog.noResults'),
    readPost: t('blog.readPost'),
    prevPage: t('blog.prevPage'),
    nextPage: t('blog.nextPage'),
  };

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-10 pb-8 sm:py-20 sm:pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl text-center">
                <Eyebrow className="mb-4">{t('blog.hero.eyebrow')}</Eyebrow>
                <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  {t('blog.hero.title')}{' '}
                  <GradientText>{t('blog.hero.titleHighlight')}</GradientText>
                </h1>
                <p className="text-lg leading-relaxed text-muted/70">
                  {t('blog.hero.subtitle')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Posts ── */}
        <Section>
          <Container>

            {/* Controls (client — only buttons & input, content is SSR) */}
            <Suspense>
              <BlogControls
                allTags={allTags}
                activeTag={tag}
                query={q}
                labels={{ searchPlaceholder: labels.searchPlaceholder, filterAll: labels.filterAll }}
              />
            </Suspense>

            {/* Grid — fully server-rendered */}
            {paginated.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted/50">{labels.noResults}</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {paginated.map((post) => (
                  <Link
                    key={safeSlug(post.slug)}
                    href={`/${locale}/blog/${safeSlug(post.slug)}`}
                    className="group flex flex-col rounded-2xl border border-line bg-surface p-6 no-underline transition-colors hover:border-accent/30"
                  >
                    {/* Meta */}
                    <div className="mb-3 flex items-center gap-2">
                      <span className="font-mono text-[0.68rem] text-muted/55 dark:text-muted/50">
                        {formatDate(post.frontmatter.date, locale)}
                      </span>
                      {post.frontmatter.tag && (
                        <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[0.68rem] text-muted/55">
                          {post.frontmatter.tag}
                        </span>
                      )}
                      {post.frontmatter.readTime && (
                        <span className="ml-auto font-mono text-[0.68rem] text-muted/50 dark:text-muted/50">
                          {post.frontmatter.readTime}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h2 className="mb-2 text-[0.95rem] font-semibold leading-snug text-kb-text transition-colors group-hover:text-accent">
                      {post.frontmatter.title}
                    </h2>

                    {/* Excerpt */}
                    <p className="mb-5 flex-1 text-sm leading-relaxed text-muted/60">
                      {post.frontmatter.excerpt ?? post.frontmatter.description}
                    </p>

                    {/* CTA */}
                    <span className="text-sm font-medium text-accent">{labels.readPost}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination (client — just updates URL) */}
            <Suspense>
              <BlogPagination
                page={page}
                totalPages={totalPages}
                labels={{ prevPage: labels.prevPage, nextPage: labels.nextPage }}
              />
            </Suspense>

          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
