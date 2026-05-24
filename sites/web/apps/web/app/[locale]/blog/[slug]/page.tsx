import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getBlogPost, listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import { Container, DotPattern, Eyebrow } from '@kb-labs/web-site-ui';
import { ShareButtons } from './ShareButtons';

// ── Static params ─────────────────────────────────────────────────────────────

export function generateStaticParams() {
  const posts = listBlogPosts('en');
  return posts.flatMap((p) => [
    { locale: 'en', slug: p.slug },
    { locale: 'ru', slug: p.slug },
  ]);
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;

  let post;
  try { post = await getBlogPost(lang, slug); } catch { return {}; }

  const { frontmatter: fm } = post;
  const meta = buildPageMetadata({
    locale,
    title: fm.title,
    description: fm.excerpt ?? fm.description,
    path: `/blog/${slug}`,
    imageSegment: `blog/${slug}`,
  });

  return {
    ...meta,
    openGraph: { ...meta.openGraph, type: 'article', publishedTime: fm.date },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric', day: 'numeric' });
}

/** Ensure slug only contains URL-safe characters (filesystem-derived, but CodeQL-safe). */
function safeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-_]/g, '');
}

const BASE_URL = 'https://kblabs.ru';

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;

  let post;
  try { post = await getBlogPost(lang, slug); } catch { notFound(); }

  const { frontmatter: fm, content } = post;

  // All posts for related + prev/next
  const allPosts = listBlogPosts(lang).filter((p) => !p.frontmatter.draft);
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  // Related posts — same tag, exclude current, max 3
  const related = allPosts
    .filter((p) => p.slug !== slug && p.frontmatter.tag === fm.tag)
    .slice(0, 3);

  const postUrl = `${BASE_URL}/${locale}/blog/${slug}`;

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line pb-12 pt-16">
          <DotPattern className="absolute inset-0 z-0 opacity-30" />
          <Container className="relative z-10">

            {/* Back link */}
            <Link
              href={`/${locale}/blog`}
              className="mb-8 inline-flex items-center gap-1 text-sm text-muted/50 transition-colors hover:text-kb-text"
            >
              <ChevronLeft size={15} />
              {t('blog.allPosts')}
            </Link>

            <div className="mx-auto max-w-2xl">
              {/* Tag */}
              {fm.tag && (
                <div className="mb-4">
                  <Eyebrow>
                    <Link
                      href={`/${locale}/blog?tag=${encodeURIComponent(fm.tag)}`}
                      className="hover:text-accent transition-colors"
                    >
                      {fm.tag}
                    </Link>
                  </Eyebrow>
                </div>
              )}

              {/* Title */}
              <h1 className="mb-6 text-3xl font-bold leading-tight tracking-tight text-kb-text sm:text-4xl">
                {fm.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-sm text-muted/50">
                  {fm.date && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} />
                      {formatDate(fm.date, locale)}
                    </span>
                  )}
                  {fm.readTime && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={13} />
                      {fm.readTime}
                    </span>
                  )}
                  {fm.author && (
                    <span className="font-medium text-muted/60">{fm.author}</span>
                  )}
                </div>

                <ShareButtons title={fm.title} url={postUrl} />
              </div>
            </div>
          </Container>
        </section>

        {/* ── Article ── */}
        <section className="py-14">
          <Container>
            <article className="
              mx-auto max-w-2xl
              prose prose-invert
              prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-kb-text
              prose-p:text-muted/80 prose-p:leading-relaxed
              prose-a:text-accent prose-a:no-underline hover:prose-a:underline
              prose-code:rounded prose-code:bg-surface prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:text-kb-text prose-code:before:content-none prose-code:after:content-none
              prose-pre:rounded-xl prose-pre:border prose-pre:border-line prose-pre:bg-surface prose-pre:text-[0.88rem]
              prose-strong:text-kb-text
              prose-hr:border-line
              prose-blockquote:border-accent/40 prose-blockquote:text-muted/70
              prose-th:text-kb-text prose-td:text-muted/70
              prose-li:text-muted/80
            ">
              {content}
            </article>
          </Container>
        </section>

        {/* ── Prev / Next ── */}
        {(prevPost || nextPost) && (
          <section className="border-t border-line">
            <Container>
              <div className="grid grid-cols-1 gap-px py-8 sm:grid-cols-2">
                {prevPost ? (
                  <Link
                    href={`/${locale}/blog/${safeSlug(prevPost.slug)}`}
                    className="group flex flex-col gap-1 rounded-xl p-4 transition-colors hover:bg-surface/50"
                  >
                    <span className="inline-flex items-center gap-1 text-xs text-muted/40">
                      <ChevronLeft size={13} />
                      {t('blog.prevPost')}
                    </span>
                    <span className="text-sm font-medium text-kb-text/80 transition-colors group-hover:text-accent">
                      {prevPost.frontmatter.title}
                    </span>
                  </Link>
                ) : <div />}

                {nextPost && (
                  <Link
                    href={`/${locale}/blog/${safeSlug(nextPost.slug)}`}
                    className="group flex flex-col items-end gap-1 rounded-xl p-4 transition-colors hover:bg-surface/50"
                  >
                    <span className="inline-flex items-center gap-1 text-xs text-muted/40">
                      {t('blog.nextPost')}
                      <ChevronRight size={13} />
                    </span>
                    <span className="text-sm font-medium text-kb-text/80 transition-colors group-hover:text-accent">
                      {nextPost.frontmatter.title}
                    </span>
                  </Link>
                )}
              </div>
            </Container>
          </section>
        )}

        {/* ── Related posts ── */}
        {related.length > 0 && (
          <section className="border-t border-line bg-surface/30 py-14">
            <Container>
              <p className="mb-6 text-[0.65rem] font-bold uppercase tracking-wider text-muted/35">
                {t('blog.relatedPosts')}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p) => (
                  <Link
                    key={safeSlug(p.slug)}
                    href={`/${locale}/blog/${safeSlug(p.slug)}`}
                    className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 no-underline transition-colors hover:border-accent/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[0.68rem] text-muted/40">
                        {formatDate(p.frontmatter.date, locale)}
                      </span>
                      {p.frontmatter.readTime && (
                        <span className="ml-auto font-mono text-[0.68rem] text-muted/35">
                          {p.frontmatter.readTime}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug text-kb-text transition-colors group-hover:text-accent">
                      {p.frontmatter.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted/55">
                      {p.frontmatter.excerpt ?? p.frontmatter.description}
                    </p>
                  </Link>
                ))}
              </div>
            </Container>
          </section>
        )}

      </main>
      <SiteFooter />
    </>
  );
}
