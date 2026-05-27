import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  CodeBlock,
  Container,
  CopyButton,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
  TerminalBlock,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';
import { ExternalLink } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kbDev' });
  return buildPageMetadata({
    locale,
    title: t('metaTitle'),
    description: t('metaDesc'),
    path: '/product/kb-dev',
    imageSegment: 'product/kb-dev',
  });
}

// ── Content ───────────────────────────────────────────────────────────────────

const DEVSERVICES_YAML = `\
name: my-project

services:
  postgres:
    type: docker
    command: docker run --rm -p 5432:5432 postgres:16
    health_check: localhost:5432
    port: 5432

  api:
    command: pnpm dev
    port: 3000
    health_check: http://localhost:3000/health
    depends_on: [postgres]

  worker:
    command: pnpm worker
    depends_on: [postgres]`;

type CommandItem = { cmd: string; desc: string };
type FeatureItem = { title: string; detail: string };

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function KbDevPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'kbDev' });
  const kbdevCommands = t.raw('commands') as CommandItem[];
  const kbdevFeatures = t.raw('features') as FeatureItem[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden py-20 pb-12">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                {/* i18n-ignore: brand + tech label */}
                <Eyebrow className="mb-4">Service Manager · Go</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  {t('heroTitle')}{' '}
                  <GradientText>{t('heroTitleHighlight')}</GradientText>
                </h1>
                <p className="mb-8 text-lg leading-relaxed text-muted/70">
                  {t('heroDescription')}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg">
                    <a href="https://docs.kblabs.ru/services/kb-dev" target="_blank" rel="noopener noreferrer">
                      {t('heroDocsBtn')}
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="https://github.com/KirillBaranov/kb-labs/releases/latest" target="_blank" rel="noopener noreferrer">
                      {/* i18n-ignore: brand name */}
                      GitHub Releases
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <TerminalBlock
                  commands={[
                    'curl -fsSL https://kblabs.ru/kb-dev/install.sh | sh',
                    'kb-dev start',
                    'kb-dev status',
                    'kb-dev doctor',
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </section>

        {/* ── devservices.yaml ── */}
        <Section className="border-t border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('configEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('configTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('configLead1')}
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  {t('configLead2')}
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <div className="max-h-72 overflow-y-auto">
                    <CodeBlock code={DEVSERVICES_YAML} language="yaml" />
                  </div>
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Commands ── */}
        <Section className="bg-surface/50">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('commandsEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('commandsTitle')}
                </h2>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll delay={80}>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                {kbdevCommands.map((item, i) => (
                  <div
                    key={item.cmd}
                    className={`flex flex-col gap-1.5 px-6 py-4 sm:flex-row sm:items-baseline sm:gap-6 ${i < kbdevCommands.length - 1 ? 'border-b border-line' : ''}`}
                  >
                    <code className="flex-shrink-0 font-mono text-[0.82rem] text-kb-text/85 sm:w-64">
                      {item.cmd}
                    </code>
                    <span className="text-sm leading-relaxed text-muted/60">{item.desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center font-mono text-[0.65rem] text-muted/45 dark:text-muted/30">
                {t('commandsFootnote')}
              </p>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Features ── */}
        <Section>
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('featuresEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('featuresTitle')}
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid gap-6 lg:grid-cols-3">
              {kbdevFeatures.map((f, i) => (
                <AnimateOnScroll key={f.title} delay={i * 80}>
                  <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                    <h3 className="mb-3 text-base font-semibold text-kb-text">{f.title}</h3>
                    <p className="mt-auto text-sm leading-relaxed text-muted/60">{f.detail}</p>
                  </div>
                </AnimateOnScroll>
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
                  <Eyebrow className="mb-4">{t('ctaEyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    {t('ctaTitle')}
                  </h2>
                  <div className="mx-auto mb-8 flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3">
                    {/* i18n-ignore: terminal command */}
                    <code className="font-mono text-[0.85rem] text-kb-text">curl -fsSL https://kblabs.ru/kb-dev/install.sh | sh</code>
                    <CopyButton code="curl -fsSL https://kblabs.ru/kb-dev/install.sh | sh" className="shrink-0" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/services/kb-dev" target="_blank" rel="noopener noreferrer">
                      {t('ctaDocsBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs/releases/latest" target="_blank" rel="noopener noreferrer">
                      {/* i18n-ignore: brand name */}
                      GitHub Releases
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
