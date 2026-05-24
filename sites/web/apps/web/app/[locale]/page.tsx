import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  Accordion,
  AgentDiagram,
  AnimateOnScroll,
  BorderBeam,
  Button,
  CodeBlock,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  PainCards,
  Section,
  SectionHeader,
  StatCard,
  Tabs,
  WorkflowDiagram,
  WorkflowRunBlock,
} from '@kb-labs/web-site-ui';
import { Github } from 'lucide-react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
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
    title: t('home.meta.title'),
    description: t('home.meta.description'),
  });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const painItems = t.raw('home.painSection.pains') as Array<{ title: string; description: string }>;

  const INTEGRATION_CATEGORIES = [
    {
      label: t('home.integrationsSection.cats.llm'),
      note: t('home.integrationsSection.llmNote'),
      items: ['OpenAI'],
    },
    {
      label: t('home.integrationsSection.cats.databases'),
      items: ['MongoDB', 'SQLite', 'DuckDB', 'Redis'],
    },
    {
      label: t('home.integrationsSection.cats.vector'),
      items: ['Qdrant', 'Voyage AI'],
    },
    {
      label: t('home.integrationsSection.cats.storage'),
      items: ['S3', 'Docker', 'GitHub'],
    },
    {
      label: t('home.integrationsSection.cats.comms'),
      items: ['Telegram', 'ClickUp'],
    },
    {
      label: t('home.integrationsSection.cats.observability'),
      items: ['Pino'],
    },
  ] satisfies Array<{ label: string; note?: string; items: string[] }>;

  type FaqItem = { id: string; question: string; answer: string; telegramLabel?: string };
  const faqItems = t.raw('home.faqSection.items') as FaqItem[];
  const lastFaq = faqItems[faqItems.length - 1];

  const FAQ = [
    ...faqItems.slice(0, -1).map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
    })),
    {
      id: lastFaq.id,
      question: lastFaq.question,
      answer: (
        <>
          {lastFaq.answer}{' '}
          <a href="https://t.me/kirill_baranov_official" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-kb-text">
            {/* i18n-ignore */}
            {lastFaq.telegramLabel}
          </a>
        </>
      ),
    },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-surface pb-20 pt-24">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[110px]" />
          <DotPattern className="opacity-[0.35]" />
          <Container>
            <div className="relative z-10 flex flex-col items-center text-center">
              <Eyebrow className="mb-5">{t('home.heroCurrent.eyebrow')}</Eyebrow>
              <h1 className="mb-5 text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
                <GradientText shimmer>{t('home.heroCurrent.titleGradient')}</GradientText>
                <span className="block">{t('home.heroCurrent.titleSecond')}</span>
              </h1>
              <p className="mb-8 max-w-[58ch] text-[1.05rem] leading-[1.75] text-muted">
                {t('home.heroCurrent.description')}
              </p>
              <div className="mb-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary" size="lg" href={`/${locale}/install`}>
                  {t('home.heroCurrent.installBtn')}
                </Button>
                <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs" target="_blank" rel="noopener noreferrer">
                  <Github className="size-4" />
                  {/* i18n-ignore */}
                  GitHub
                </Button>
              </div>
              <p className="mb-10 text-[0.8rem] text-muted/60">
                {t('home.heroCurrent.licenseNote')}
              </p>
              <div className="w-full max-w-[560px]">
                <WorkflowRunBlock />
              </div>
            </div>
          </Container>
        </div>

        {/* ── Pain points ───────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow={t('home.painSection.eyebrow')}
                title={t('home.painSection.title')}
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={60}>
              <PainCards items={painItems} />
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Workflow diagram ───────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.4fr]">
              <AnimateOnScroll animation="fade">
                <div className="flex flex-col gap-4">
                  <Eyebrow>{t('home.workflowSection.eyebrow')}</Eyebrow>
                  <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.12] tracking-tight text-kb-text">
                    {t('home.workflowSection.title')}
                  </h2>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    {t('home.workflowSection.description')}
                  </p>
                </div>
              </AnimateOnScroll>
              <AnimateOnScroll animation="slide-left" delay={100}>
                <Tabs
                  variant="card"
                  contentClassName="h-[460px]"
                  extra={
                    <span className="font-mono text-[0.68rem] text-muted/40">
                      {/* i18n-ignore */}
                      code-review.yaml
                    </span>
                  }
                  items={[
                    {
                      id: 'diagram',
                      label: t('home.workflowSection.tabDiagram'),
                      content: <WorkflowDiagram className="p-6" />,
                    },
                    {
                      id: 'code',
                      label: t('home.workflowSection.tabYaml'),
                      content: (
                        <CodeBlock
                          code={WORKFLOW_CODE}
                          language="yaml"
                          bare
                        />
                      ),
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Agents ────────────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <AnimateOnScroll animation="slide-left" delay={100}>
                <AgentDiagram />
              </AnimateOnScroll>
              <AnimateOnScroll animation="fade">
                <div className="flex flex-col gap-4">
                  <Eyebrow>{t('home.agentsSection.eyebrow')}</Eyebrow>
                  <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.12] tracking-tight text-kb-text">
                    {t('home.agentsSection.title')}
                  </h2>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    {t('home.agentsSection.para1Start')}{' '}
                    <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.85em] text-kb-text">kb github create-pr</code>
                    {t('home.agentsSection.para1End')}
                  </p>
                  <p className="text-[1rem] leading-[1.8] text-muted">
                    {t('home.agentsSection.para2')}
                  </p>
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Integrations ──────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow={t('home.integrationsSection.eyebrow')}
                title={t('home.integrationsSection.title')}
                subtitle={t('home.integrationsSection.subtitle')}
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={60}>
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {INTEGRATION_CATEGORIES.map((cat, i) => (
                    <div
                      key={cat.label}
                      className="border-b border-r border-line p-5 last-of-type:border-b-0 [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0"
                    >
                      <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted/50">
                        {cat.label}
                      </p>
                      {cat.note && (
                        <p className="mb-2.5 text-[0.72rem] text-muted/60">{cat.note}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {cat.items.map(item => (
                          <span
                            key={item}
                            className="rounded-md border border-white/15 bg-white/[0.07] px-2 py-0.5 font-mono text-[0.75rem] text-kb-text/80"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line bg-bg px-5 py-3">
                  <p className="text-[0.8rem] text-muted/60">
                    {t('home.integrationsSection.notFound')}{' '}
                    <a href={`/${locale}/product#gateway`} className="underline underline-offset-2 hover:text-muted">
                      {t('home.integrationsSection.writeAdapter')}
                    </a>
                    {' '}{t('home.integrationsSection.adapterSuffix')}
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Trust ─────────────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="fade">
              <SectionHeader
                eyebrow={t('home.trustSection.eyebrow')}
                title={
                  <>
                    {t('home.trustSection.titleStart')}{' '}
                    <GradientText shimmer>{t('home.trustSection.titleHighlight')}</GradientText>
                    {' '}{t('home.trustSection.titleSuffix')}
                  </>
                }
                subtitle={t('home.trustSection.subtitle')}
              />
            </AnimateOnScroll>
            <AnimateOnScroll animation="slide-up" delay={80}>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <StatCard
                  value={t('home.trustSection.stat1Value')}
                  label={t('home.trustSection.stat1Label')}
                  description={t('home.trustSection.stat1Desc')}
                />
                <StatCard
                  value={t('home.trustSection.stat2Value')}
                  label={t('home.trustSection.stat2Label')}
                  description={t('home.trustSection.stat2Desc')}
                />
                <StatCard
                  value={t('home.trustSection.stat3Value')}
                  label={t('home.trustSection.stat3Label')}
                  description={t('home.trustSection.stat3Desc')}
                />
              </div>
            </AnimateOnScroll>

            {/* Founder quote — combined with trust block */}
            <AnimateOnScroll animation="fade" delay={120}>
              <div className="mt-12 flex flex-col items-center gap-4 border-t border-line pt-10 text-center">
                <blockquote className="max-w-[52ch] text-[1.1rem] font-medium leading-[1.75] text-kb-text/80">
                  {t('home.trustSection.quote')}
                </blockquote>
                <div className="flex items-center gap-3 text-[0.82rem] text-muted/60">
                  <span className="h-px w-8 bg-line-strong block" />
                  <span className="flex items-center gap-2">
                    {/* i18n-ignore */}
                    Kirill Baranov &middot;{' '}
                    <a href="https://k-baranov.ru" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
                      {/* i18n-ignore */}
                      k-baranov.ru
                    </a>
                    &middot;{' '}
                    <a href="https://t.me/kirill_baranov" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
                      {/* i18n-ignore */}
                      Telegram
                    </a>
                  </span>
                  <span className="h-px w-8 bg-line-strong block" />
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <Section>
          <Container maxWidth="720px">
            <AnimateOnScroll animation="fade">
              <SectionHeader eyebrow={t('home.faqSection.eyebrow')} title={t('home.faq.title')} />
              <Accordion items={FAQ} />
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Final CTA ─────────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center shadow-sm">
              <BorderBeam />
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[80px]" />
              <div className="relative z-10 flex flex-col items-center gap-5">
                <Eyebrow>{t('home.ctaSection.eyebrow')}</Eyebrow>
                <h2 className="max-w-[22ch] text-[clamp(1.75rem,3.5vw,2.4rem)] font-bold leading-[1.1] tracking-tight text-kb-text">
                  {t('home.ctaSection.title')}
                </h2>
                <p className="max-w-[44ch] text-[1rem] leading-[1.75] text-muted">
                  {t('home.ctaSection.description')}
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-1">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    {t('home.ctaSection.installBtn')}
                  </Button>
                  <Button variant="secondary" size="lg" href="https://github.com/KirillBaranov/kb-labs" target="_blank" rel="noopener noreferrer">
                    <Github className="size-4" />
                    {/* i18n-ignore */}
                    GitHub
                  </Button>
                </div>
              </div>
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}

const WORKFLOW_CODE = `name: code-review
version: "1.0"

on:
  push: true

inputs:
  pr:
    type: string
    required: true

jobs:
  review:
    runsOn: sandbox
    steps:
      - id: diff
        name: Fetch diff
        uses: builtin:shell
        with:
          command: gh pr diff \${{ inputs.pr }} --patch

      - id: analyze
        name: AI review
        uses: plugin:@kb-labs/review#run
        with:
          diff: \${{ steps.diff.outputs.stdout }}
          rules: [security, perf, style]

      - id: gate
        name: Check score
        uses: builtin:gate
        with:
          decision: steps.analyze.outputs.passed
          routes:
            "true": continue
            "false": fail

      - id: comment
        name: Post results
        uses: builtin:shell
        with:
          command: |
            gh pr comment \${{ inputs.pr }} \\
              --body "\${{ steps.analyze.outputs.summary }}"
`;
