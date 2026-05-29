import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  CodeBlock,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
  SectionHeader,
  StatCard,
  Tabs,
  WorkflowLiveGraph,
  WorkflowRunBlock,
} from '@kb-labs/web-site-ui';
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
    title: t('productWorkflows.meta.title'),
    description: t('productWorkflows.meta.description'),
    path: '/product/workflows',
    imageSegment: 'product/workflows',
  });
}

// Real workflow YAML excerpts from .kb/workflows/
const YAML_REVIEW = `\
name: pr-review-gate
on:
  github:
    event: pull_request.opened

jobs:
  validate:
    steps:
      - id: run-tests
        run: builtin:shell
        with:
          cmd: pnpm test --coverage

      - id: ai-review
        run: plugin:@kb-labs/review#run
        with:
          pr: \${{ inputs.PR_NUMBER }}
          model: claude-sonnet-4-6

      - id: gate
        run: builtin:gate
        with:
          condition: \${{ steps.ai-review.score >= 7 }}`;

const YAML_DEPLOY = `\
name: production-deploy
on:
  push: { branch: main }

jobs:
  build-frontend:
    steps:
      - run: builtin:shell
        with: { cmd: npm run build:web }

  build-backend:          # parallel with frontend
    steps:
      - run: builtin:shell
        with: { cmd: docker build -t api . }

  deploy-staging:
    needs: [build-frontend, build-backend]
    steps:
      - run: builtin:shell
        with: { cmd: ./deploy.sh staging }

  approve:
    needs: [deploy-staging]
    steps:
      - run: builtin:approval
        with:
          message: "Staging OK. Deploy to prod?"
          context: \${{ jobs.deploy-staging.metrics }}

  deploy-prod:
    needs: [approve]
    steps:
      - run: builtin:shell
        with: { cmd: ./deploy.sh prod }
      - run: builtin:gate          # auto-rollback if unhealthy
        with:
          condition: \${{ steps.healthcheck.error_rate < 0.01 }}
          fail_action: rollback`;

const YAML_DEVCYCLE = `\
name: dev-cycle
on:
  manual: true

inputs:
  task_id:
    type: string
    description: ClickUp task ID to implement

jobs:
  setup:
    steps:
      - run: builtin:shell
        with: { cmd: kb clickup task get \${{ inputs.task_id }} }
      - run: builtin:shell
        with: { cmd: gh pr create --draft --title "feat: \${{ steps.task.title }}" }

  plan:
    needs: [setup]
    steps:
      - run: plugin:@kb-labs/agent#run
        with:
          mode: plan
          context: \${{ jobs.setup.outputs }}

  review-plan:             # human reviews before any code
    needs: [plan]
    steps:
      - run: builtin:approval
        with:
          message: "Review the implementation plan"
          artifact: \${{ jobs.plan.plan_md }}

  implement:
    needs: [review-plan]
    steps:
      - run: plugin:@kb-labs/agent#run
        with: { mode: execute }
      - run: plugin:@kb-labs/commit#run`;

const YAML_INVOICE = `\
name: invoice-approval
on:
  webhook:
    path: /hooks/invoice-received

jobs:
  parse:
    steps:
      - id: invoice
        run: builtin:shell
        with:
          cmd: jq '{vendor,amount,currency}' /tmp/invoice.json

  route:
    needs: [parse]
    steps:
      - run: builtin:gate
        with:
          condition: \${{ jobs.parse.invoice.amount }}
          routes:
            auto:   "amount < 1000"    # auto-approved
            lead:   "amount < 10000"   # team lead
            cfo:    "amount >= 10000"  # CFO + Legal

  approve:
    needs: [route]
    steps:
      - run: builtin:approval
        with:
          approver: \${{ jobs.route.outputs.approver }}
          context:  \${{ jobs.parse.invoice }}`;

export default async function WorkflowsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const PRIMITIVES = t.raw('productWorkflows.page.primitives') as Array<{
    id: string;
    name: string;
    desc: string;
    detail: string;
  }>;

  const TRIGGERS_DATA = t.raw('productWorkflows.page.triggers') as Array<{ label: string }>;
  const TRIGGERS: { label: string; icon: string; badge?: 'beta' | 'soon' }[] = [
    { label: TRIGGERS_DATA[0].label, icon: '▶' },
    { label: TRIGGERS_DATA[1].label, icon: '⏱' },
    { label: TRIGGERS_DATA[2].label, icon: '⚡' },
    { label: TRIGGERS_DATA[3].label, icon: '⤷', badge: 'beta' },
    { label: TRIGGERS_DATA[4].label, icon: '⬆', badge: 'soon' },
    { label: TRIGGERS_DATA[5].label, icon: '⤴', badge: 'soon' },
  ];

  const USE_CASES = t.raw('productWorkflows.page.useCases') as Array<{
    title: string;
    desc: string;
  }>;

  const REAL_WORKFLOW_ITEMS = t.raw('productWorkflows.page.realWorkflowItems') as Array<{
    label: string;
    desc: string;
  }>;

  const STATS_ITEMS = t.raw('productWorkflows.page.statsItems') as Array<{
    value: string;
    label: string;
  }>;

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-surface pb-16 pt-24">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[100px]" />
          <DotPattern className="opacity-[0.30]" />
          <Container>
            <div className="relative z-10 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

              {/* Left: text */}
              <div>
                <Eyebrow className="mb-5">{t('productWorkflows.page.heroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-[clamp(2rem,4.5vw,3.2rem)] font-bold leading-[1.08] tracking-tight text-kb-text">
                  <GradientText shimmer>{t('productWorkflows.page.heroTitleGradient')}</GradientText>
                  <span className="block">{t('productWorkflows.page.heroTitleSecond')}</span>
                </h1>
                <p className="mb-8 max-w-[48ch] text-[1.05rem] leading-[1.75] text-muted">
                  {t('productWorkflows.page.heroDescription')}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    {t('productWorkflows.page.installBtn')}
                  </Button>
                  <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/workflows" target="_blank" rel="noopener noreferrer">
                    {t('productWorkflows.page.docsBtn')}
                  </Button>
                </div>
              </div>

              {/* Right: terminal */}
              <WorkflowRunBlock className="w-full" />

            </div>
          </Container>
        </div>

        {/* ── Stats ─────────────────────────────────────────────── */}
        <Section className="border-y border-line bg-bg py-10">
          <Container>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {STATS_ITEMS.map((s) => (
                <AnimateOnScroll key={s.label} animation="slide-up">
                  <StatCard value={s.value} label={s.label} />
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── Mental model ──────────────────────────────────────── */}
        <Section>
          <Container>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">

              {/* Text */}
              <AnimateOnScroll animation="slide-up">
                <SectionHeader
                  eyebrow={t('productWorkflows.page.mentalModelEyebrow')}
                  title={t('productWorkflows.page.mentalModelTitle')}
                />
                <div className="space-y-4 text-[1rem] leading-[1.75] text-muted">
                  <p>{t('productWorkflows.page.mentalModelPara1')}</p>
                  <p>{t('productWorkflows.page.mentalModelPara2')}</p>
                  <p>
                    {t('productWorkflows.page.mentalModelPara3Start')}{' '}
                    <code className="rounded bg-line/40 px-1 font-mono text-sm">kb workflow runs watch</code>
                  </p>
                </div>
              </AnimateOnScroll>

              {/* Live graph */}
              <AnimateOnScroll animation="slide-up" delay={150}>
                <WorkflowLiveGraph className="w-full max-w-[440px] mx-auto lg:mx-0" />
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── Real workflow examples ────────────────────────────── */}
        <Section className="bg-bg">
          <Container>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">

              {/* Left: descriptions */}
              <AnimateOnScroll animation="slide-up">
                <SectionHeader
                  eyebrow={t('productWorkflows.page.realWorkflowsEyebrow')}
                  title={t('productWorkflows.page.realWorkflowsTitle')}
                />
                <div className="space-y-5">
                  {REAL_WORKFLOW_ITEMS.map((item) => (
                    <div key={item.label} className="flex gap-3">
                      <span className="mt-1 text-emerald-500/70 flex-shrink-0 text-sm">✓</span>
                      <div>
                        <div className="text-[0.9rem] font-semibold text-kb-text">{item.label}</div>
                        <div className="text-[0.85rem] leading-[1.6] text-muted">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimateOnScroll>

              {/* Right: code tabs */}
              <AnimateOnScroll animation="slide-up" delay={120} className="min-w-0 overflow-hidden">
                <Tabs
                  variant="card"
                  contentClassName="max-h-[480px] overflow-x-auto"
                  items={[
                    {
                      id: 'review',
                      label: 'Code Review',
                      content: <CodeBlock code={YAML_REVIEW} language="yaml" filename="pr-review-gate.yaml" bare />,
                    },
                    {
                      id: 'deploy',
                      label: 'Deploy',
                      content: <CodeBlock code={YAML_DEPLOY} language="yaml" filename="production-deploy.yaml" bare />,
                    },
                    {
                      id: 'devcycle',
                      label: 'Dev Cycle',
                      content: <CodeBlock code={YAML_DEVCYCLE} language="yaml" filename="dev-cycle.yaml" bare />,
                    },
                    {
                      id: 'invoice',
                      label: 'Invoice',
                      content: <CodeBlock code={YAML_INVOICE} language="yaml" filename="invoice-approval.yaml" bare />,
                    },
                  ]}
                />
              </AnimateOnScroll>

            </div>
          </Container>
        </Section>

        {/* ── Three primitives ──────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="slide-up">
              <SectionHeader
                eyebrow={t('productWorkflows.page.primitivesEyebrow')}
                title={t('productWorkflows.page.primitivesTitle')}
                subtitle={t('productWorkflows.page.primitivesSubtitle')}
                align="center"
              />
            </AnimateOnScroll>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {PRIMITIVES.map((p, i) => (
                <AnimateOnScroll key={p.id} animation="slide-up" delay={i * 80}>
                  <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
                    <code className="font-mono text-[0.8rem] font-semibold text-accent/80">{p.name}</code>
                    <p className="flex-1 text-[0.9rem] leading-[1.7] text-muted">{p.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.detail.split(' · ').map((d) => (
                        <span key={d} className="rounded-md bg-bg px-2 py-0.5 font-mono text-[0.68rem] text-muted/60 ring-1 ring-inset ring-line">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── Triggers ──────────────────────────────────────────── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll animation="slide-up">
              <SectionHeader
                eyebrow={t('productWorkflows.page.triggersEyebrow')}
                title={t('productWorkflows.page.triggersTitle')}
                subtitle={t('productWorkflows.page.triggersSubtitle')}
              />
            </AnimateOnScroll>

            <AnimateOnScroll animation="slide-up" delay={100}>
              <div className="flex flex-wrap gap-3">
                {TRIGGERS.map((trigger) => (
                  <div
                    key={trigger.label}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2"
                  >
                    <span className="text-muted/50 text-sm" aria-hidden="true">{trigger.icon}</span>
                    <span className={`font-mono text-[0.82rem] ${trigger.badge === 'soon' ? 'text-muted/55 dark:text-muted/50' : 'text-muted/80'}`}>
                      {trigger.label}
                    </span>
                    {trigger.badge === 'beta' && (
                      <span className="rounded px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-600/80 ring-1 ring-inset ring-amber-500/20">
                        {/* i18n-ignore */}
                        beta
                      </span>
                    )}
                    {trigger.badge === 'soon' && (
                      <span className="rounded px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider bg-line text-muted/55 dark:text-muted/50 ring-1 ring-inset ring-line">
                        {/* i18n-ignore */}
                        soon
                      </span>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-full border border-dashed border-line px-4 py-2">
                  <span className="font-mono text-[0.82rem] text-muted/55 dark:text-muted/50">{t('productWorkflows.page.triggerCustom')}</span>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Use cases ─────────────────────────────────────────── */}
        <Section>
          <Container>
            <AnimateOnScroll animation="slide-up">
              <SectionHeader
                eyebrow={t('productWorkflows.page.useCasesEyebrow')}
                title={t('productWorkflows.page.useCasesTitle')}
              />
            </AnimateOnScroll>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((uc, i) => (
                <AnimateOnScroll key={uc.title} animation="slide-up" delay={i * 60}>
                  <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-6 h-full">
                    <h3 className="text-[1rem] font-bold text-kb-text">{uc.title}</h3>
                    <p className="text-[0.88rem] leading-[1.7] text-muted">{uc.desc}</p>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── CTA ───────────────────────────────────────────────── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll animation="slide-up">
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">{t('productWorkflows.page.ctaEyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    {t('productWorkflows.page.ctaTitle')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    {t('productWorkflows.page.ctaDescription')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('productWorkflows.page.installBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/workflows" target="_blank" rel="noopener noreferrer">
                      {t('productWorkflows.page.docsBtn')}
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
