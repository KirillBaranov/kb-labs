import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  AnimateOnScroll,
  ChangelogEntry,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
  type ChangeType,
} from '@kb-labs/web-site-ui';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('changelog.meta.title'),
    description: t('changelog.meta.description'),
    path: '/changelog',
    imageSegment: 'changelog',
  });
}

type Release = {
  version: string;
  date: string;
  title?: string;
  summary?: string;
  changes: Array<{ type: ChangeType; text: string }>;
};

export default async function ChangelogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const releases = t.raw('changelog.releases') as Release[];

  const labels: Partial<Record<ChangeType, string>> = {
    new:      t('changelog.typeNew'),
    added:    t('changelog.typeNew'),
    improved: t('changelog.typeImproved'),
    changed:  t('changelog.typeImproved'),
    fixed:    t('changelog.typeFixed'),
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
                <Eyebrow className="mb-4">{t('changelog.hero.eyebrow')}</Eyebrow>
                <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  {t('changelog.hero.title')}{' '}
                  <GradientText>{t('changelog.hero.titleHighlight')}</GradientText>
                </h1>
                <p className="text-lg leading-relaxed text-muted/70">
                  {t('changelog.hero.subtitle')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Timeline ── */}
        <Section>
          <Container>
            <div className="pt-4 pb-8">
              {releases.map((release, i) => (
                <ChangelogEntry
                  key={release.version}
                  version={release.version}
                  date={release.date}
                  title={release.title}
                  summary={release.summary}
                  changes={release.changes}
                  latest={i === 0}
                  last={i === releases.length - 1}
                  labels={labels}
                />
              ))}
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
