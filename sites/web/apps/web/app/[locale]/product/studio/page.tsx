import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { ScreenshotLightbox } from '@/components/ScreenshotLightbox';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  MockupFrame,
  Section,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';
import { ExternalLink } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'productStudio' });
  return buildPageMetadata({
    locale,
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/product/studio',
    imageSegment: 'product/studio',
  });
}

export default async function StudioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'productStudio' });

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden py-10 pb-8 sm:py-20 sm:pb-10">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow className="mb-4">{t('hero.eyebrow')}</Eyebrow>
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                {t('hero.title')}{' '}
                <GradientText>{t('hero.titleHighlight')}</GradientText>
              </h1>
              <p className="mb-8 text-lg leading-relaxed text-muted/70">
                {t('hero.description')}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <a href={`/${locale}/install`}>{t('hero.installBtn')}</a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="https://docs.kblabs.ru/services/studio" target="_blank" rel="noopener noreferrer">
                    {t('hero.docsBtn')}
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
              </div>
            </div>

            <AnimateOnScroll delay={100}>
              <div className="mx-auto mt-14 max-w-5xl">
                <MockupFrame type="browser" url="localhost:3000/marketplace">
                  <ScreenshotLightbox
                    src="/screenshots/marketplace-ui.png"
                    alt="KB Labs Studio — Marketplace"
                    url="localhost:3000/marketplace"
                    loading="eager"
                  />
                </MockupFrame>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Observability ── */}
        <Section className="border-t border-line bg-surface/50">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <MockupFrame type="browser" url="localhost:3000/observability/logs">
                  <ScreenshotLightbox
                    src="/screenshots/logs-observability.png"
                    alt="KB Labs Studio — Live Logs"
                    url="localhost:3000/observability/logs"
                  />
                </MockupFrame>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <Eyebrow className="mb-3">{t('observability.eyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('observability.title')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('observability.description')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/services/studio" target="_blank" rel="noopener noreferrer">
                    {t('observability.docsBtn')}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── LLM Analytics ── */}
        <Section>
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('analytics.eyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('analytics.title')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('analytics.description')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/services/studio" target="_blank" rel="noopener noreferrer">
                    {t('analytics.docsBtn')}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <MockupFrame type="browser" url="localhost:3000/analytics/llm">
                  <ScreenshotLightbox
                    src="/screenshots/llm-analytics.png"
                    alt="KB Labs Studio — LLM Usage Analytics"
                    url="localhost:3000/analytics/llm"
                  />
                </MockupFrame>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Plugin Pages ── */}
        <Section className="bg-surface/50">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('pluginPages.eyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('pluginPages.title')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('pluginPages.description')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/services/studio" target="_blank" rel="noopener noreferrer">
                    {t('pluginPages.docsBtn')}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <MockupFrame type="browser" url="localhost:3000/marketplace">
                  <ScreenshotLightbox
                    src="/screenshots/marketplace-ui.png"
                    alt="KB Labs Studio — Plugin Pages"
                    url="localhost:3000/marketplace"
                  />
                </MockupFrame>
              </AnimateOnScroll>
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
                  <Eyebrow className="mb-4">{t('cta.eyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    {t('cta.title')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    {t('cta.description')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('cta.installBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/services/studio" target="_blank" rel="noopener noreferrer">
                      {t('cta.docsBtn')}
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
