import type { Metadata } from 'next';

import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { listBlogPosts, type Lang } from '@/lib/content';
import { buildPageMetadata } from '@/lib/page-metadata';
import { Container, Section } from '@kb-labs/web-site-ui';

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

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });
  const lang = (locale === 'ru' ? 'ru' : 'en') as Lang;
  const posts = listBlogPosts(lang).filter((p) => !p.frontmatter.draft);

  return (
    <>
      <SiteHeader />
      <main>

        <Section className="border-b border-line">
          <Container>
            <div className="py-16 text-center">
              <h1 className="text-4xl font-bold tracking-tight text-kb-text sm:text-5xl">
                {t('blog.hero.title')}
              </h1>
              <p className="mt-4 text-lg text-muted/70">{t('blog.hero.subtitle')}</p>
            </div>
          </Container>
        </Section>

        <Section>
          <Container>
            <div className="py-12 flex flex-col gap-px divide-y divide-line">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/${locale}/blog/${post.slug}`}
                  className="group flex flex-col gap-2 py-7 no-underline hover:bg-surface/30 transition-colors px-2 -mx-2 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted/50">{formatDate(post.frontmatter.date, locale)}</span>
                    {post.frontmatter.tag && (
                      <span className="rounded-md border border-line px-2 py-0.5 text-xs text-muted/60">
                        {post.frontmatter.tag}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-kb-text group-hover:text-accent transition-colors">
                    {post.frontmatter.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted/70">
                    {post.frontmatter.excerpt ?? post.frontmatter.description}
                  </p>
                  <span className="text-sm text-accent">{t('blog.readMore')} →</span>
                </Link>
              ))}
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
