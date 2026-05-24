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
  Tabs,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'solutionPlatformApi' });
  return buildPageMetadata({
    locale,
    title: t('page.meta.title'),
    description: t('page.meta.description'),
    path: '/solutions/platform-api',
    imageSegment: 'solutions',
  });
}

// ── Content ───────────────────────────────────────────────────────────────────

// i18n-ignore: code example
const INIT_CODE = `import { KBPlatform } from '@kb-labs/sdk/platform';

const platform = new KBPlatform({
  endpoint: process.env.KB_ENDPOINT!,  // http://localhost:4000
  apiKey:   process.env.KB_API_KEY!,
});

// LLM, cache, vector search, telemetry — ready to use
`;

// i18n-ignore: code example
const LLM_CODE = `// Text completion
const result = await platform.llm.complete(
  'Explain this function',
  {
    model:        'gpt-4o',
    systemPrompt: 'You are a code assistant.',
    temperature:  0.3,
  }
);
console.log(result.content);
// { content: '...', usage: { promptTokens: 84, completionTokens: 312 }, model: 'gpt-4o' }

// Chat with tool calling
const res = await platform.llm.chatWithTools(messages, tools);
// { content, toolCalls: [{ id, name, input }], stopReason: 'tool_use' }`;

// i18n-ignore: code example
const CACHE_CODE = `// TTL in milliseconds
await platform.cache.set('session:123', userData, 3_600_000);

const cached = await platform.cache.get<UserData>('session:123');
// null if expired or not found

await platform.cache.delete('session:123');
await platform.cache.clear('session:*');  // glob pattern`;

// i18n-ignore: code example
const VECTOR_CODE = `// Index documents
await platform.vectorStore.upsert([
  {
    id:       'doc-1',
    vector:   embedding,          // number[]
    metadata: { title: 'Intro', section: 'overview' },
  },
]);

// Semantic search with filter
const results = await platform.vectorStore.search({
  vector: queryEmbedding,
  limit:  10,
  filter: { field: 'section', operator: 'eq', value: 'overview' },
});
// [{ id, score, metadata }, ...]

const total = await platform.vectorStore.count();`;

// i18n-ignore: code example
const TELEMETRY_CODE = `// Buffered — auto-flush every 5s, batch size 50
platform.telemetry.event('user.signup',   { plan: 'pro' });
platform.telemetry.event('build.started', { packages: 12 });

// Metrics and logs use the same batch pipeline
platform.telemetry.metric('api.latency', 142, { route: '/complete' });
platform.telemetry.log('warn', 'Rate limit hit', { userId: '123' });

// Force flush before process exit
await platform.telemetry.flush();
await platform.shutdown();   // flush + stop timers`;

// i18n-ignore: code example
const HOOKS_CODE = `import { useLLM, useCache, useAnalytics, useStorage } from '@kb-labs/sdk';

// In-process — no HTTP round-trip, same interfaces as KBPlatform
const llm       = useLLM();
const cache     = useCache();
const analytics = useAnalytics();
const storage   = useStorage();

const result = await llm.complete(prompt, { temperature: 0.2 });
await cache.set('result', result, 60_000);
await analytics.track('commit.plan.generated', { tokensUsed: result.usage.completionTokens });`;

// i18n-ignore: code example
const MANIFEST_CODE = `import { combinePermissions, gitWorkflowPreset } from '@kb-labs/sdk';

const permissions = combinePermissions()
  .with(gitWorkflowPreset)
  .withPlatform({
    llm:       true,               // full LLM access
    cache:     ['my-plugin'],      // namespace-isolated cache
    analytics: true,               // event tracking
  })
  .withQuotas({
    timeoutMs: 120_000,
    memoryMb:  256,
  })
  .build();`;

// i18n-ignore: code example
const CONFIG_CODE = `// kb.config.json — swap adapter here, code stays the same
{
  "platform": {
    "adapters": {
      "llm":         "@kb-labs/adapters-openai",
      "cache":       "@kb-labs/adapters-redis",
      "vectorStore": "@kb-labs/adapters-qdrant",
      "analytics":   "@kb-labs/adapters-analytics-duckdb"
    },
    "adapterOptions": {
      "llm":   { "model": "gpt-4o-mini" },
      "cache": { "url": "redis://localhost:6379" }
    }
  }
}`;

const ADAPTERS = [
  {
    label: 'LLM',
    providers: 'OpenAI, KB Labs Gateway',
    note: 'complete() · chatWithTools() · streaming',
  },
  {
    label: 'Cache',
    providers: 'Redis, in-memory',
    note: 'get/set/delete/clear · TTL · glob patterns',
  },
  {
    label: 'Vector Store',
    providers: 'Qdrant',
    note: 'upsert · search · filter · count',
  },
  {
    label: 'Analytics',
    providers: 'DuckDB, SQLite, JSONL',
    note: 'track · event · metric · log · batching',
  },
  {
    label: 'Embeddings',
    providers: 'OpenAI, Voyage AI',
    note: 'embed() · embedBatch()',
  },
  {
    label: 'Storage',
    providers: 'Local FS, S3',
    note: 'read · write · list · delete',
  },
];

const CONFIG_TABLE = [
  { label: 'LLM',          value: 'OpenAI GPT-4o / KB Labs Gateway / custom' },
  { label: 'Cache',         value: 'Redis · in-memory · custom' },
  { label: 'Vector Store',  value: 'Qdrant · in-memory · custom' },
  { label: 'Analytics',     value: 'DuckDB · SQLite · JSONL file' },
  { label: 'Embeddings',    value: 'OpenAI · Voyage AI · custom' },
  { label: 'Storage',       value: 'Local FS · S3 · custom' },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PlatformApiPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'solutionPlatformApi' });

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
                <Eyebrow className="mb-4">Platform API · SDK</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('page.heroTitle')}{' '}
                  <GradientText>{t('page.heroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('page.heroDescription')}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href="https://docs.kblabs.ru/platform-api" target="_blank" rel="noopener noreferrer">
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

        {/* ── Quick start ── */}
        <Section className="border-b border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('page.externalEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.externalTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('page.externalLead1')}
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  {t('page.externalLead2')}
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock code={INIT_CODE} language="typescript" />
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Adapters code ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll className="lg:order-2">
                <Eyebrow className="mb-3">{t('page.adaptersEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.adaptersTitle')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('page.adaptersLead')}
                </p>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <div className="grid grid-cols-[max-content_1fr]">
                    {ADAPTERS.map(({ label, providers, note }, i) => {
                      const border = i < ADAPTERS.length - 1 ? 'border-b border-line' : '';
                      return (
                        <>
                          <span key={`${label}-lbl`} className={`pl-5 pr-5 py-3.5 whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-wider text-muted/35 ${border}`}>
                            {label}
                          </span>
                          <div key={`${label}-val`} className={`py-3.5 pr-5 ${border}`}>
                            <div className="text-sm text-kb-text/80">{providers}</div>
                            <div className="text-sm text-muted/50 mt-0.5">{note}</div>
                          </div>
                        </>
                      );
                    })}
                  </div>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80} className="lg:order-1">
                <Tabs
                  variant="card"
                  contentClassName="max-h-[360px] overflow-auto"
                  items={[
                    {
                      id: 'llm',
                      label: 'LLM', // i18n-ignore: tech term
                      content: <CodeBlock code={LLM_CODE} language="typescript" bare />,
                    },
                    {
                      id: 'cache',
                      label: 'Cache', // i18n-ignore: tech term
                      content: <CodeBlock code={CACHE_CODE} language="typescript" bare />,
                    },
                    {
                      id: 'vector',
                      label: 'VectorStore', // i18n-ignore: tech term
                      content: <CodeBlock code={VECTOR_CODE} language="typescript" bare />,
                    },
                    {
                      id: 'telemetry',
                      label: 'Telemetry', // i18n-ignore: tech term
                      content: <CodeBlock code={TELEMETRY_CODE} language="typescript" bare />,
                    },
                  ]}
                />
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Inside plugins ── */}
        <Section className="border-b border-line">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll>
                <Eyebrow className="mb-3">{t('page.pluginsEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.pluginsTitle')}
                </h2>
                <p className="mb-4 text-base leading-relaxed text-muted/70">
                  {t('page.pluginsLead1')}
                </p>
                <p className="text-base leading-relaxed text-muted/70">
                  {t('page.pluginsLead2')}
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80}>
                <Tabs
                  variant="card"
                  contentClassName="max-h-[320px] overflow-auto"
                  items={[
                    {
                      id: 'hooks',
                      label: t('page.tabHooks'),
                      content: <CodeBlock code={HOOKS_CODE} language="typescript" bare />,
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

        {/* ── Config ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
              <AnimateOnScroll className="lg:order-2">
                <Eyebrow className="mb-3">{t('page.configEyebrow')}</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.configTitle')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('page.configLead')}
                </p>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <div className="grid grid-cols-[max-content_1fr]">
                    {CONFIG_TABLE.map(({ label, value }, i) => {
                      const border = i < CONFIG_TABLE.length - 1 ? 'border-b border-line' : '';
                      return (
                        <>
                          <span key={`${label}-lbl`} className={`pl-5 pr-5 py-3.5 whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-wider text-muted/35 ${border}`}>
                            {label}
                          </span>
                          <span key={`${label}-val`} className={`py-3.5 pr-5 text-sm text-muted/70 ${border}`}>
                            {value}
                          </span>
                        </>
                      );
                    })}
                  </div>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={80} className="lg:order-1">
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock code={CONFIG_CODE} language="json" />
                </div>
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
                  <div className="mx-auto mb-8 flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3">
                    {/* i18n-ignore: terminal command */}
                    <code className="font-mono text-[0.85rem] text-kb-text">npm install @kb-labs/sdk</code>
                    <CopyButton code="npm install @kb-labs/sdk" className="shrink-0" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/platform-api" target="_blank" rel="noopener noreferrer">
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
