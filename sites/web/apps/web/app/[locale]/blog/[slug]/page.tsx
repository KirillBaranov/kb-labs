import type { Metadata } from 'next';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getBlogPost, listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from '../post.module.css';

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

        <header className={s.header}>
          <span className={s.tag}>{fm.tag}</span>
          <h1>{fm.title}</h1>
          <div className={s.meta}>
            <span>{fm.date ? new Date(fm.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}</span>
            {fm.readTime && (
              <>
                <span className={s.metaDot} />
                <span>{fm.readTime}</span>
              </>
            )}
          </div>
        </header>

        <Link className={s.back} href={`/${locale}/blog`}>← All posts</Link>

        <article className={s.article}>
          {content}
        </article>

      </main>
      <SiteFooter />
    </>
  );
}
