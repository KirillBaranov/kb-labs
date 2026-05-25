import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
  GlowCard,
  GradientText,
  Section,
  StatCard,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  CheckCircle2,
  Clock,
  Eye,
  Layers,
  MessageCircle,
  Shield,
  Users,
} from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('enterprise.meta.title'),
    description: t('enterprise.meta.description'),
    path: '/enterprise',
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function EnterprisePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const STATS = [
    { value: '100%', label: t('enterprise.stats.0.label') },
    { value: 'OSS',  label: t('enterprise.stats.1.label') },
    { value: 'Q3–Q4', label: t('enterprise.stats.2.label') },
    { value: '0',    label: t('enterprise.stats.3.label') },
  ];

  const WHY = [
    { icon: Users,   title: t('enterprise.why.0.title'), description: t('enterprise.why.0.description') },
    { icon: Layers,  title: t('enterprise.why.1.title'), description: t('enterprise.why.1.description') },
    { icon: Shield,  title: t('enterprise.why.2.title'), description: t('enterprise.why.2.description') },
    { icon: Eye,     title: t('enterprise.why.3.title'), description: t('enterprise.why.3.description') },
  ];

  const FEATURES_TODAY = [
    { title: t('enterprise.featuresToday.0.title'), description: t('enterprise.featuresToday.0.description') },
    { title: t('enterprise.featuresToday.1.title'), description: t('enterprise.featuresToday.1.description') },
  ];

  const FEATURES_ROADMAP = [
    { title: t('enterprise.featuresRoadmap.0.title'), description: t('enterprise.featuresRoadmap.0.description') },
    { title: t('enterprise.featuresRoadmap.1.title'), description: t('enterprise.featuresRoadmap.1.description') },
    { title: t('enterprise.featuresRoadmap.2.title'), description: t('enterprise.featuresRoadmap.2.description') },
    { title: t('enterprise.featuresRoadmap.3.title'), description: t('enterprise.featuresRoadmap.3.description') },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-24 pb-20">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('enterprise.hero.eyebrow')}</Eyebrow>
                <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  <GradientText>{t('enterprise.hero.titleLine1')}</GradientText>
                  <br />
                  <span className="text-kb-text">{t('enterprise.hero.titleLine2')}</span>
                </h1>
                <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('enterprise.hero.subtitle')}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href={`/${locale}/contact`}>
                    {t('enterprise.hero.ctaPrimary')}
                  </Button>
                  <Button variant="secondary" size="lg" href={`/${locale}/install`}>
                    {t('enterprise.hero.ctaSecondary')}
                  </Button>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Stats ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {STATS.map((s, i) => (
                  <AnimateOnScroll key={s.label} delay={i * 50}>
                    <StatCard value={s.value} label={s.label} />
                  </AnimateOnScroll>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Why ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <Eyebrow className="mb-4">{t('enterprise.whyEyebrow')}</Eyebrow>
                <h2 className="mb-8 text-3xl font-bold tracking-tight text-kb-text">
                  {t('enterprise.whyHeading')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {WHY.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <AnimateOnScroll key={item.title} delay={i * 50}>
                        <GlowCard className="flex h-full flex-col gap-4 rounded-2xl border border-line p-5">
                          <div className="flex size-9 items-center justify-center rounded-lg border border-line bg-bg text-muted">
                            <Icon size={17} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold text-kb-text">{item.title}</p>
                            <p className="text-sm leading-relaxed text-muted/60">{item.description}</p>
                          </div>
                        </GlowCard>
                      </AnimateOnScroll>
                    );
                  })}
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Features: Today vs Roadmap ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <Eyebrow className="mb-4">{t('enterprise.featuresEyebrow')}</Eyebrow>
                <h2 className="mb-8 text-3xl font-bold tracking-tight text-kb-text">
                  {t('enterprise.featuresHeading')}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface divide-y divide-line">

                  {/* Today */}
                  <div className="bg-surface/60 px-5 py-2.5">
                    <span className="text-sm font-bold uppercase tracking-widest text-muted/40">{t('enterprise.featuresLabelToday')}</span>
                  </div>
                  {FEATURES_TODAY.map((f) => (
                    <div key={f.title} className="flex items-start gap-4 px-5 py-4">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-kb-text">{f.title}</span>
                        <span className="text-sm leading-relaxed text-muted/60">{f.description}</span>
                      </div>
                    </div>
                  ))}

                  {/* Roadmap */}
                  <div className="bg-surface/60 px-5 py-2.5">
                    <span className="text-sm font-bold uppercase tracking-widest text-muted/40">Roadmap</span>
                  </div>
                  {FEATURES_ROADMAP.map((f) => (
                    <div key={f.title} className="flex items-start gap-4 px-5 py-4">
                      <Clock size={16} className="mt-0.5 shrink-0 text-muted/30" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-kb-text">{f.title}</span>
                        <span className="text-sm leading-relaxed text-muted/60">{f.description}</span>
                      </div>
                    </div>
                  ))}

                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section>
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-10 text-center">
                  <BorderBeam />
                  <div className="relative z-10">
                    <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border border-line bg-bg text-muted">
                      <MessageCircle size={22} />
                    </div>
                    <h2 className="mb-3 text-2xl font-bold tracking-tight text-kb-text">
                      {t('enterprise.cta.title')}
                    </h2>
                    <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted/60">
                      {t('enterprise.cta.description')}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button variant="primary" href={`/${locale}/contact`}>
                        {t('enterprise.cta.salesBtn')}
                      </Button>
                      <Button variant="secondary" href="mailto:kirillBaranovJob@yandex.ru"> {/* i18n-ignore */}
                        kirillBaranovJob@yandex.ru {/* i18n-ignore */}
                      </Button>
                    </div>
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
