import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Accordion,
  AnimateOnScroll,
  BorderBeam,
  Button,
  ComparisonTable,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  PricingCard,
  Section,
} from '@kb-labs/web-site-ui';
import type { AccordionItem, ComparisonCategory } from '@kb-labs/web-site-ui';
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
    title: t('pricing.meta.title'),
    description: t('pricing.meta.description'),
    path: '/pricing',
    imageSegment: 'pricing',
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const OPEN_SOURCE_FEATURES = [
    t('pricing.tiers.hobby.features.0'),
    t('pricing.tiers.hobby.features.1'),
    t('pricing.tiers.hobby.features.2'),
    t('pricing.tiers.hobby.features.3'),
    t('pricing.tiers.hobby.features.4'),
  ];

  const CLOUD_FEATURES = [
    t('pricing.tiers.pro.features.0'),
    t('pricing.tiers.pro.features.1'),
    t('pricing.tiers.pro.features.2'),
    t('pricing.tiers.pro.features.3'),
    t('pricing.tiers.pro.features.4'),
  ];

  const ENTERPRISE_FEATURES = [
    t('pricing.tiers.enterprise.features.0'),
    t('pricing.tiers.enterprise.features.1'),
    t('pricing.tiers.enterprise.features.2'),
    t('pricing.tiers.enterprise.features.3'),
    t('pricing.tiers.enterprise.features.4'),
  ];

  const COMPARISON: ComparisonCategory[] = [
    {
      label: t('pricing.comparison.categories.platform.label'),
      rows: [
        { feature: t('pricing.comparison.platformRows.pluginSdk'),    values: [true,         true,        true] },
        { feature: t('pricing.comparison.platformRows.onPrem'),       values: [true,         true,        true] },
        { feature: t('pricing.comparison.platformRows.cloudHosting'), values: [false,        'Roadmap',   'Roadmap'] },
        { feature: t('pricing.comparison.platformRows.premiumPlugins'),values: [false,       'Roadmap',   'Roadmap'] },
        { feature: t('pricing.comparison.platformRows.marketplace'),  values: ['Roadmap',    'Roadmap',   'Roadmap'] },
      ],
    },
    {
      label: t('pricing.comparison.categories.support.label'),
      rows: [
        { feature: t('pricing.comparison.supportRows.community'),   values: [true,  true,      true] },
        { feature: t('pricing.comparison.supportRows.priority'),    values: [false, 'Roadmap', true] },
        { feature: t('pricing.comparison.supportRows.sla'),         values: [false, false,     'Roadmap'] },
        { feature: t('pricing.comparison.supportRows.dedicated'),   values: [false, false,     'Roadmap'] },
      ],
    },
    {
      label: t('pricing.comparison.categories.security.label'),
      rows: [
        { feature: t('pricing.comparison.securityRows.sandbox'),    values: [true,  true,  true] },
        { feature: t('pricing.comparison.securityRows.auditLog'),   values: [true,  true,  true] },
        { feature: t('pricing.comparison.securityRows.governance'), values: [false, false, 'Roadmap'] },
      ],
    },
  ];

  const FAQ_ITEMS: AccordionItem[] = [
    {
      id: 'free-forever',
      question: t('pricing.faq.items.0.q'),
      answer: t('pricing.faq.items.0.a'),
    },
    {
      id: 'cloud',
      question: t('pricing.faq.items.1.q'),
      answer: t('pricing.faq.items.1.a'),
    },
    {
      id: 'production',
      question: t('pricing.faq.items.2.q'),
      answer: t('pricing.faq.items.2.a'),
    },
    {
      id: 'support',
      question: t('pricing.faq.items.3.q'),
      answer: t('pricing.faq.items.3.a'),
    },
    {
      id: 'lock-in',
      question: t('pricing.faq.items.4.q'),
      answer: t('pricing.faq.items.4.a'),
    },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-12 pb-10 sm:py-24 sm:pb-20">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('pricing.hero.eyebrow')}</Eyebrow>
                <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  <GradientText>{t('pricing.hero.titleLine1')}</GradientText>
                  <br />
                  <span className="text-kb-text">{t('pricing.hero.titleLine2')}</span>
                </h1>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('pricing.hero.subtitle')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Tiers ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
                <AnimateOnScroll delay={0} className="h-full">
                  <PricingCard
                    name={t('pricing.tiers.hobby.name')}
                    price={t('pricing.tiers.hobby.price')}
                    note={t('pricing.tiers.hobby.note')}
                    features={OPEN_SOURCE_FEATURES}
                    cta={t('pricing.tiers.hobby.cta')}
                    href={`/${locale}/install`}
                    className="h-full"
                  />
                </AnimateOnScroll>
                <AnimateOnScroll delay={60} className="h-full">
                  <PricingCard
                    name={t('pricing.tiers.pro.name')}
                    price={t('pricing.tiers.pro.price')}
                    note={t('pricing.tiers.pro.note')}
                    badge={t('pricing.tiers.pro.badge')}
                    features={CLOUD_FEATURES}
                    cta={t('pricing.tiers.pro.cta')}
                    href={`/${locale}/signup`}
                    featured
                    className="h-full"
                  />
                </AnimateOnScroll>
                <AnimateOnScroll delay={120} className="h-full">
                  <PricingCard
                    name={t('pricing.tiers.enterprise.name')}
                    price={t('pricing.tiers.enterprise.price')}
                    note={t('pricing.tiers.enterprise.note')}
                    features={ENTERPRISE_FEATURES}
                    cta={t('pricing.tiers.enterprise.cta')}
                    href={`/${locale}/contact`}
                    className="h-full"
                  />
                </AnimateOnScroll>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Comparison ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl">
                <Eyebrow className="mb-4">{t('pricing.comparison.eyebrow')}</Eyebrow>
                <h2 className="mb-8 text-3xl font-bold tracking-tight text-kb-text">
                  {t('pricing.comparison.heading')}
                </h2>
                <ComparisonTable
                  headers={[t('pricing.comparison.colFeature'), 'Open Source', 'Cloud', 'Enterprise']} // i18n-ignore plan names
                  categories={COMPARISON}
                  highlightCol={1}
                />
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── FAQ ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <Eyebrow className="mb-4">{t('pricing.faq.eyebrow')}</Eyebrow>
                <h2 className="mb-8 text-3xl font-bold tracking-tight text-kb-text">
                  {t('pricing.faq.heading')}
                </h2>
                <Accordion items={FAQ_ITEMS} />
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section>
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div className="relative z-10">
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('pricing.cta.title2')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-md text-base leading-relaxed text-muted/70">
                    {t('pricing.cta.description2')}
                  </p>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('pricing.cta.startBtn2')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/contact`}>
                      {t('pricing.cta.contactBtn')}
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
