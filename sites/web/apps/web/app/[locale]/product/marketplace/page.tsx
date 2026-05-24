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
    title: `${t('marketplace.meta.title')} — KB Labs`,
    description: t('marketplace.meta.description'),
    path: '/product/marketplace',
    imageSegment: 'marketplace',
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
        <section className="relative overflow-hidden border-b border-line py-16">
          <DotPattern className="absolute inset-0 z-0 opacity-30" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <Eyebrow className="mb-4">Marketplace</Eyebrow>
              <h1 className="mb-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                <GradientText>{t('marketplace.hero.title')}</GradientText>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted/70">
                {t('marketplace.hero.description')}
                {items.length > 0 && (
                  <span className="ml-2 font-mono text-sm text-muted/40">
                    {t('marketplace.hero.extensionsCount', { count: items.length })}
                  </span>
                )}
              </p>
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
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
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
