import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  ComparisonTable,
  Container,
  DotPattern,
  Eyebrow,
  GlowCard,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import type { ComparisonCategory } from '@kb-labs/web-site-ui';
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
    title: t('page.cmpMetaTitle'),
    description: t('page.cmpMetaDesc'),
    path: '/compare',
  });
}

export default async function ComparePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const tableHeaders = t.raw('page.cmpTableHeaders') as string[];
  const tableCategories = t.raw('page.cmpTableCategories') as ComparisonCategory[];
  const alternatives = t.raw('page.cmpAlternatives') as Array<{
    num: string;
    label: string;
    verdict: string;
    good: string[];
    kb: string[];
    note: string | null;
  }>;
  const objections = t.raw('page.cmpObjections') as Array<{ q: string; a: string }>;

  return (
    <>
      <SiteHeader />
      <main>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-30" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('page.cmpHeroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('page.cmpHeroTitle')}{' '}
                  <GradientText>{t('page.cmpHeroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted/60">
                  {t('page.cmpHeroDescription')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* Feature matrix */}
        <Section className="border-b border-line bg-surface/30">
          <Container>
            <AnimateOnScroll>
              <div className="mb-8 text-center">
                <Eyebrow className="mb-3">{t('page.cmpMatrixEyebrow')}</Eyebrow>
                <h2 className="text-2xl font-bold tracking-tight text-kb-text">{t('page.cmpMatrixTitle')}</h2>
              </div>
              <ComparisonTable
                headers={tableHeaders}
                categories={tableCategories}
                highlightCol={1}
              />
              <p className="mt-3 text-right text-sm text-muted/45 dark:text-muted/30">
                {t('page.cmpMatrixLegend')}
              </p>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* Deep-dive sections */}
        {alternatives.map((alt, i) => (
          <Section
            key={alt.num}
            className={`border-b border-line${i % 2 === 1 ? ' bg-surface/30' : ''}`}
          >
            <Container>
              <AnimateOnScroll>
                <div className="grid gap-10 lg:grid-cols-[200px,1fr]">

                  {/* Left */}
                  <div className="flex flex-col gap-2">
                    <span className="text-5xl font-bold leading-none text-muted/15">{alt.num}</span>
                    <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-muted/50">
                      vs
                    </span>
                    <span className="text-sm font-semibold text-kb-text">{alt.label}</span>
                  </div>

                  {/* Right */}
                  <div>
                    <p className="mb-6 text-xl font-semibold leading-snug text-kb-text">
                      {alt.verdict}
                    </p>

                    <div className="grid gap-6 sm:grid-cols-2">
                      {/* Good at */}
                      <div>
                        <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-widest text-muted/55 dark:text-muted/40">
                          {t('page.cmpGoodLabel')}
                        </p>
                        <ul className="space-y-2">
                          {alt.good.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-muted/60">
                              <span className="mt-0.5 flex-shrink-0 text-muted/45 dark:text-muted/30">✓</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* KB Labs edge */}
                      <div>
                        <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-widest text-accent/70">
                          {t('page.cmpKbLabel')}
                        </p>
                        <ul className="space-y-2">
                          {alt.kb.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-muted/70">
                              <span className="mt-0.5 flex-shrink-0 text-accent">→</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {alt.note && (
                      <p className="mt-5 rounded-xl border border-line bg-surface/50 px-4 py-3 text-sm italic text-muted/50">
                        {alt.note}
                      </p>
                    )}
                  </div>
                </div>
              </AnimateOnScroll>
            </Container>
          </Section>
        ))}

        {/* Objections */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mb-10 text-center">
                <Eyebrow className="mb-3">{t('page.cmpObjectionsEyebrow')}</Eyebrow>
                <h2 className="text-2xl font-bold tracking-tight text-kb-text">
                  {t('page.cmpObjectionsTitle')}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {objections.map((obj) => (
                  <GlowCard
                    key={obj.q}
                    className="rounded-2xl border border-line bg-surface p-5"
                  >
                    <p className="mb-2 text-sm font-semibold text-kb-text">«{obj.q}»</p>
                    <p className="text-sm leading-relaxed text-muted/60">{obj.a}</p>
                  </GlowCard>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* CTA */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <div className="relative z-10">
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('page.cmpCtaTitle')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-md text-base text-muted/60">
                    {t('page.cmpCtaDescription')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('page.cmpInstallBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru" target="_blank" rel="noopener noreferrer">
                      {t('page.cmpDocsBtn')}
                    </Button>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
