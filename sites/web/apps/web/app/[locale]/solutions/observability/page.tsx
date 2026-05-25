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
  DotPattern,
  Eyebrow,
  GradientText,
  MockupFrame,
  Section,
  Tabs,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'solutionObservability' });
  return buildPageMetadata({
    locale,
    title: t('page.meta.title'),
    description: t('page.meta.description'),
    path: '/solutions/observability',
    imageSegment: 'solutions',
  });
}

// ── Content ───────────────────────────────────────────────────────────────────

// i18n-ignore: code example
const PLUGIN_TRACK_CODE = `// В любом плагине — через SDK // i18n-ignore
import { useAnalytics } from '@kb-labs/sdk';

const analytics = useAnalytics();

await analytics.track('commit.plan.generated', {
  scope:             'root',
  filesChanged:      14,
  commitsGenerated:  3,
  llmUsed:           true,
  tokensUsed:        1840,
  durationMs:        4200,
});`;

// i18n-ignore: code example
const MANIFEST_CODE = `// manifest.ts — включить в разрешения плагина // i18n-ignore
const permissions = combinePermissions()
  .withPlatform({
    analytics: true,   // доступ к platform.analytics // i18n-ignore
    llm:       true,
    cache:     ['my-plugin'],
  })
  .build();`;

// i18n-ignore: code example
const CONFIG_SQLITE = `// kb.config.json
{
  "platform": {
    "adapters": {
      "analytics": "@kb-labs/adapters-analytics-sqlite"
    },
    "adapterOptions": {
      "analytics": {
        "filename": ".kb/analytics/analytics.sqlite"
      }
    }
  }
}`;

// i18n-ignore: code example
const CONFIG_DUCKDB = `// kb.config.json
{
  "platform": {
    "adapters": {
      "analytics": "@kb-labs/adapters-analytics-duckdb"
    },
    "adapterOptions": {
      "analytics": {
        "dbPath": ".kb/analytics/analytics.duckdb"
      }
    }
  }
}`;

// i18n-ignore: code example
const CONFIG_FILE = `// kb.config.json
{
  "platform": {
    "adapters": {
      "analytics": "@kb-labs/adapters-analytics-file"
    },
    "adapterOptions": {
      "analytics": {
        "path": ".kb/analytics/events.jsonl"
      }
    }
  }
}`;

// i18n-ignore: code example
const QUERY_STATS = `// getStats() — агрегат по всем событиям // i18n-ignore
const stats = await analytics.getStats();
// {
//   totalEvents: 4821,
//   byType: {
//     "commit.plan.generated": 312,
//     "commit.push.success":   289,
//     "workflow.run.completed": 1840,
//   },
//   bySource: { "commit": 601, "workflow": 1840 },
//   byActor:  { "user:kirill": 4200 },
//   timeRange: { from: "2026-05-01T...", to: "2026-05-24T..." }
// }`;

// i18n-ignore: code example
const QUERY_DAILY = `// getDailyStats() — time-series с группировкой // i18n-ignore
const daily = await analytics.getDailyStats({
  type:        'commit.plan.generated',
  groupBy:     'hour',          // hour | day | week | month
  breakdownBy: 'payload.scope', // dot-notation в JSON payload
  from:        '2026-05-01',
  to:          '2026-05-24',
});
// [
//   { date: "2026-05-24 09", count: 12, breakdown: "root" },
//   { date: "2026-05-24 09", count:  3, breakdown: "packages/core" },
//   ...
// ]`;

// i18n-ignore: terminal output
const MONITOR_OUTPUT = `$ kb-monitor health

  gateway       ✓  healthy   uptime 14d 3h
  rest-api      ✓  healthy   uptime 14d 3h
  workflow      ✓  healthy   uptime  6d 1h
  marketplace   ✓  healthy   uptime  6d 1h
  state         ✓  healthy   uptime 14d 3h

$ kb-monitor logs workflow --follow

  [workflow] 14:23:01 run abc123 started · trigger=manual
  [workflow] 14:23:02 step "checkout" completed [0.3s]
  [workflow] 14:23:08 step "build"    completed [5.9s]
  [workflow] 14:23:09 run abc123 finished · status=success`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ObservabilityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'solutionObservability' });

  const backendsTable = t.raw('page.backendsTable') as Array<{ label: string; value: string }>;
  const monitorCommands = t.raw('page.monitorCommands') as Array<{ cmd: string; note: string }>;

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                {/* i18n-ignore: brand name */}
                <Eyebrow className="mb-4">Observability · Analytics</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('page.heroTitle')}{' '}
                  <GradientText>{t('page.heroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('page.heroDescription')}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href="https://docs.kblabs.ru/observability" target="_blank" rel="noopener noreferrer">
                    {t('page.docsBtn')}
                  </Button>
                  <Button variant="secondary" size="lg" href={`/${locale}/install`}>
                    {t('page.installBtn')}
                  </Button>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Events ── */}
        <Section className="border-b border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('page.eventsEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.eventsTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('page.eventsLead1')}
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  {t('page.eventsLead2')}
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80}>
                <Tabs
                  variant="card"
                  contentClassName="max-h-[320px] overflow-auto"
                  items={[
                    {
                      id: 'track',
                      label: 'track()', // i18n-ignore: API method name
                      content: <CodeBlock code={PLUGIN_TRACK_CODE} language="typescript" bare />,
                    },
                    {
                      id: 'manifest',
                      label: 'manifest.ts', // i18n-ignore: filename
                      content: <CodeBlock code={MANIFEST_CODE} language="typescript" bare />,
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Backends ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll className="lg:order-2">
                <Eyebrow className="mb-3">{t('page.backendsEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.backendsTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('page.backendsLead')}
                </p>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm divide-y divide-line">
                  {backendsTable.map(({ label, value }) => (
                    <div key={label} className="flex items-baseline gap-4 px-5 py-3.5">
                      <span className="flex-shrink-0 whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-wider text-muted/35">{label}</span>
                      <span className="text-sm text-muted/70">{value}</span>
                    </div>
                  ))}
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80} className="lg:order-1">
                <Tabs
                  variant="card"
                  contentClassName="max-h-[280px] overflow-auto"
                  items={[
                    {
                      id: 'sqlite',
                      label: 'SQLite', // i18n-ignore: brand name
                      content: <CodeBlock code={CONFIG_SQLITE} language="json" bare />,
                    },
                    {
                      id: 'duckdb',
                      label: 'DuckDB', // i18n-ignore: brand name
                      content: <CodeBlock code={CONFIG_DUCKDB} language="json" bare />,
                    },
                    {
                      id: 'file',
                      label: 'File', // i18n-ignore: tech term
                      content: <CodeBlock code={CONFIG_FILE} language="json" bare />,
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Query ── */}
        <Section className="border-b border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('page.queryEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.queryTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('page.queryLead1')}
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  {t('page.queryLead2')}
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80}>
                <Tabs
                  variant="card"
                  contentClassName="max-h-[320px] overflow-auto"
                  items={[
                    {
                      id: 'stats',
                      label: 'getStats()', // i18n-ignore: API method name
                      content: <CodeBlock code={QUERY_STATS} language="typescript" bare />,
                    },
                    {
                      id: 'daily',
                      label: 'getDailyStats()', // i18n-ignore: API method name
                      content: <CodeBlock code={QUERY_DAILY} language="typescript" bare />,
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Monitor ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll className="lg:order-2">
                <Eyebrow className="mb-3">{t('page.monitorEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.monitorTitle')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('page.monitorLead')}
                </p>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  {monitorCommands.map((c, i, arr) => (
                    <div key={c.cmd} className={`flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4 ${i < arr.length - 1 ? 'border-b border-line' : ''}`}>
                      <code className="flex-shrink-0 font-mono text-[0.78rem] text-kb-text/85 sm:w-60">{c.cmd}</code>
                      <span className="text-sm leading-relaxed text-muted/50">{c.note}</span>
                    </div>
                  ))}
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80} className="lg:order-1">
                {/* i18n-ignore: terminal output */}
                <MockupFrame type="terminal" title="kb-monitor">
                  <pre className="whitespace-pre p-5 font-mono text-[0.73rem] leading-[1.85] text-slate-300">{MONITOR_OUTPUT}</pre>
                </MockupFrame>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">{t('page.ctaEyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold leading-tight tracking-tight text-kb-text">
                    {t('page.ctaTitle')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-sm text-base text-muted/60">
                    {t('page.ctaNote')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/observability" target="_blank" rel="noopener noreferrer">
                      {t('page.docsBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/install`}>
                      {t('page.installBtn')}
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
