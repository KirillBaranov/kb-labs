import type { Metadata } from 'next';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getBlogPost, listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import { Container, Section } from '@kb-labs/web-site-ui';

export function generateStaticParams() {
  const posts = listBlogPosts('en');
  return posts.flatMap((p) => [
    { locale: 'en', slug: p.slug },
    { locale: 'ru', slug: p.slug },
  ]);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;

  let post;
  try {
    post = await getBlogPost(lang, slug);
  } catch {
    return {};
  }

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
    openGraph: {
      ...meta.openGraph,
      type: 'article',
      publishedTime: fm.date,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;

  let post;
  try {
    post = await getBlogPost(lang, slug);
  } catch {
    notFound();
  }

  const { frontmatter: fm, content } = post;

  return (
    <>
      <SiteHeader />
      <main>

        <Section className="border-b border-line">
          <Container>
            <div className="py-14">
              <Link
                href={`/${locale}/blog`}
                className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted/60 hover:text-kb-text transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                All posts
              </Link>

              {fm.tag && (
                <span className="mb-4 inline-block rounded-md border border-line px-2 py-0.5 text-xs text-muted/60">
                  {fm.tag}
                </span>
              )}
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-kb-text sm:text-4xl">{fm.title}</h1>
              <div className="mt-4 flex items-center gap-3 text-sm text-muted/50">
                <span>{fm.date ? new Date(fm.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}</span>
                {fm.readTime && (
                  <>
                    <span className="size-1 rounded-full bg-muted/30" />
                    <span>{fm.readTime}</span>
                  </>
                )}
              </div>
            </div>
          </Container>
        </Section>

        <Section>
          <Container>
            <article className="prose prose-invert max-w-none py-12">
              {content}
            </article>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
