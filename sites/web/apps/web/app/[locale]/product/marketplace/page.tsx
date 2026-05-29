// seo-ignore og-keys (marketplace OG intentionally uses hero/eyebrow text for visual richness)
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';
import { fetchRegistryItems } from '@/lib/marketplace-data';
import { MarketplaceCatalog } from './MarketplaceCatalog';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('marketplace.meta.title'),
    description: t('marketplace.meta.description'),
    path: '/product/marketplace',
    imageSegment: 'product/marketplace',
  });
}

export default async function MarketplacePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const items = await fetchRegistryItems();

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line pb-14 pt-20">
          <DotPattern className="absolute inset-0 z-0 opacity-25" />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[560px] -translate-x-1/2 rounded-full bg-accent/[0.05] blur-[90px]" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              {/* i18n-ignore: brand label */}
              <Eyebrow className="mb-5">Marketplace</Eyebrow>
              <h1 className="mb-5 max-w-2xl text-[clamp(2.2rem,4.5vw,3.4rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
                <GradientText shimmer>{t('marketplace.hero.title')}</GradientText>
              </h1>
              <p className="max-w-[50ch] text-[1.05rem] leading-[1.75] text-muted">
                {t('marketplace.hero.description')}
              </p>
              {items.length > 0 && (
                <p className="mt-3 font-mono text-[0.75rem] text-muted/55 dark:text-muted/50">
                  {t('marketplace.hero.extensionsCount', { count: items.length })}
                </p>
              )}
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Catalog ── */}
        <section className="border-b border-line">
          <Container className="py-10">
            <MarketplaceCatalog items={items} locale={locale} />
          </Container>
        </section>

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">{t('marketplace.cta.eyebrow')}</Eyebrow>
                  <h2 className="mb-3 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    {t('marketplace.cta.title')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-md text-base leading-relaxed text-muted/60">
                    {t('marketplace.cta.description')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/guides/first-plugin" target="_blank" rel="noopener noreferrer">
                      {t('marketplace.cta.pluginGuide')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/install`}>
                      {t('marketplace.cta.installBtn')}
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
