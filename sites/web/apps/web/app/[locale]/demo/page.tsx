import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { WorkflowDemo } from '@/components/workflow-demo/WorkflowDemo';
import { buildPageMetadata } from '@/lib/page-metadata';

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
} from '@kb-labs/web-site-ui';
import {
  GitBranch,
  Layers,
  RefreshCw,
  UserCheck,
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
    title: t('demo.meta.title'),
    description: t('demo.meta.description'),
    path: '/demo',
  });
}

export default async function DemoPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const HOW_IT_WORKS_ICONS = [GitBranch, Layers, RefreshCw, UserCheck];
  const HOW_IT_WORKS = (t.raw('demo.howItWorks.items') as Array<{ title: string; description: string }>).map(
    (item, i) => ({ ...item, icon: HOW_IT_WORKS_ICONS[i] }),
  );

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-10 pb-8 sm:py-20 sm:pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('demo.hero.eyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('demo.hero.titlePrefix')}{' '}
                  <GradientText>{t('demo.hero.titleGradient')}</GradientText>
                </h1>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('demo.hero.description')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Demo ── */}
        <div className="border-b border-line py-8 lg:py-12">
          <Container>
            <WorkflowDemo />
          </Container>
        </div>

        {/* ── How it works ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <Eyebrow className="mb-4">{t('demo.howItWorks.eyebrow')}</Eyebrow>
                <h2 className="mb-8 text-3xl font-bold tracking-tight text-kb-text">
                  {t('demo.howItWorks.title')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {HOW_IT_WORKS.map((item, i) => {
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

        {/* ── CTA ── */}
        <Section>
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div className="relative z-10">
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('demo.cta.title')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted/70">
                    {t('demo.cta.description')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('demo.cta.installBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/product/workflows`}>
                      {t('demo.cta.workflowsBtn')}
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
