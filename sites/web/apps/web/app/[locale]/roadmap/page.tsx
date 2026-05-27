import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  RoadmapEntry,
  Section,
  type RoadmapStatus,
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
    title: t('roadmap.meta.title'),
    description: t('roadmap.meta.description'),
    path: '/roadmap',
    imageSegment: 'roadmap',
  });
}

type QuarterData = {
  id: string;
  quarter: string;
  theme: string;
  status: RoadmapStatus;
  current?: boolean;
  items: Array<{ title: string; description?: string; status: RoadmapStatus }>;
};

export default async function RoadmapPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const quarters = t.raw('roadmap.quarters') as QuarterData[];

  const labels = {
    shipped:    t('roadmap.statusShipped'),
    inProgress: t('roadmap.statusInProgress'),
    planned:    t('roadmap.statusPlanned'),
    exploring:  t('roadmap.statusExploring'),
    current:    t('roadmap.statusCurrent'),
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
                <Eyebrow className="mb-4">{t('roadmap.heroEyebrow')}</Eyebrow>
                <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  {t('roadmap.hero.title')}{' '}
                  <GradientText>{t('roadmap.heroTitleHighlight')}</GradientText>
                </h1>
                <p className="text-lg leading-relaxed text-muted/70">
                  {t('roadmap.hero.description')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Quarter nav ── */}
        <div className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <Container>
            <nav className="flex gap-2 overflow-x-auto py-3">
              {quarters.map((q) => (
                <a
                  key={q.id}
                  href={`#${q.id}`}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-muted/60 transition-colors hover:text-kb-text ${q.current ? 'border-accent/30 bg-accent/5 text-accent' : ''}`}
                >
                  {q.current && <span className="size-1.5 rounded-full bg-accent animate-pulse" />}
                  {q.quarter}
                </a>
              ))}
            </nav>
          </Container>
        </div>

        {/* ── Timeline ── */}
        <Section>
          <Container>
            <div className="pt-4 pb-8">
              {quarters.map((q, i) => (
                <div key={q.id} id={q.id}>
                  <RoadmapEntry
                    quarter={q.quarter}
                    theme={q.theme}
                    status={q.status}
                    items={q.items}
                    current={q.current}
                    last={i === quarters.length - 1}
                    labels={labels}
                  />
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('roadmap.cta.title')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted/70">
                    {t('roadmap.cta.description')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('roadmap.cta.startBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/contact`}>
                      {t('roadmap.cta.contactBtn')}
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
