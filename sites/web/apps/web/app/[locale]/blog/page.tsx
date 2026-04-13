import type { Metadata } from 'next';

import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from './page.module.css';

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

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;
  const posts = listBlogPosts(lang).filter((p) => !p.frontmatter.draft);

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>Blog</h1>
          <p>Engineering notes, platform updates, and thinking out loud.</p>
        </section>

        <div className={s.posts}>
          {posts.map((post) => (
            <Link key={post.slug} className={s.post} href={`/${locale}/blog/${post.slug}`}>
              <div className={s.postMeta}>
                <span className={s.postDate}>{formatDate(post.frontmatter.date)}</span>
                <span className={s.postTag}>{post.frontmatter.tag}</span>
              </div>
              <div className={s.postBody}>
                <h2 className={s.postTitle}>{post.frontmatter.title}</h2>
                <p className={s.postExcerpt}>{post.frontmatter.excerpt ?? post.frontmatter.description}</p>
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
