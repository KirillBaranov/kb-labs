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
  Section,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'page' });
  return buildPageMetadata({
    locale,
    title: t('prodMetaTitle'),
    description: t('prodMetaDesc'),
    path: '/product',
    imageSegment: 'product',
  });
}

const WORKFLOW_YAML = `# workflow.yaml
name: release
steps:
  - plugin: qa-entry
    run: qa:gate
  - plugin: review-entry
    run: review:run --mode=full
  - type: gate
    label: QA approval
  - plugin: release-entry
    run: release:push`;

const ADAPTER_ROWS = [
  { label: 'LLM', value: 'OpenAI · KB Labs Gateway' },
  { label: 'Cache', value: 'Redis · in-memory' },
  { label: 'Vector Store', value: 'Qdrant' },
  { label: 'Analytics', value: 'DuckDB · SQLite · File' },
  { label: 'Storage', value: 'Local FS · S3' },
  { label: 'Embeddings', value: 'OpenAI · Voyage AI' },
  { label: 'Database', value: 'PostgreSQL · SQLite · MongoDB' },
];

type ExploreItem = { hrefSegment: string; title: string; desc: string };

export default async function ProductPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'page' });
  const prodWorkflowsBullets = t.raw('prodWorkflowsBullets') as string[];
  const prodGatewayBullets = t.raw('prodGatewayBullets') as string[];
  const prodExploreItems = t.raw('prodExploreItems') as ExploreItem[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('prodHeroTitle')}{' '}
                  <GradientText>{t('prodHeroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-muted/70">
                  {t('prodHeroDescription')}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    {t('prodHeroInstallBtn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    href="https://docs.kblabs.ru"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('prodHeroDocsBtn')}
                  </Button>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* Section 1 — Workflows */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="grid gap-12 lg:grid-cols-2">
                {/* Left */}
                <div>
                  <Eyebrow className="mb-4">{t('prodWorkflowsEyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                    {t('prodWorkflowsTitle')}
                  </h2>
                  <p className="mb-4 text-base leading-relaxed text-muted/70">
                    {t('prodWorkflowsLead')}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-muted/70">
                    {prodWorkflowsBullets.map((bullet) => (
                      <li key={bullet}><span className="mr-2 text-accent">→</span>{bullet}</li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Button variant="secondary" size="sm" href={`/${locale}/product/workflows`}>
                      {t('prodWorkflowsLink')}
                    </Button>
                  </div>
                </div>

                {/* Right — YAML code block */}
                <div>
                  <CodeBlock language="yaml" code={WORKFLOW_YAML} />
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* Section 2 — Gateway */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="grid gap-12 lg:grid-cols-2">
                {/* Left — text (lg:order-2) */}
                <div className="lg:order-2">
                  <Eyebrow className="mb-4">{t('prodGatewayEyebrow')}</Eyebrow>
                  <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                    {t('prodGatewayTitle')}
                  </h2>
                  <p className="mb-4 text-base leading-relaxed text-muted/70">
                    {t('prodGatewayLead')}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-muted/70">
                    {prodGatewayBullets.map((bullet) => (
                      <li key={bullet}><span className="mr-2 text-accent">→</span>{bullet}</li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Button variant="secondary" size="sm" href={`/${locale}/solutions/platform-api`}>
                      {t('prodGatewayLink')}
                    </Button>
                  </div>
                </div>

                {/* Right — adapter table (lg:order-1) */}
                <div className="lg:order-1">
                  <div className="rounded-2xl border border-line bg-surface overflow-hidden divide-y divide-line">
                    {ADAPTER_ROWS.map((row) => (
                      <div key={row.label} className="flex items-baseline gap-4 px-5 py-3.5">
                        <span className="w-28 flex-shrink-0 text-sm font-semibold uppercase tracking-wider text-muted/40">
                          {row.label}
                        </span>
                        <span className="text-sm text-muted/70">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* Section 3 — Explore deeper */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mb-10 text-center">
                <Eyebrow className="mb-4">{t('prodExploreEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('prodExploreTitle')}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {prodExploreItems.map((item) => (
                  <a
                    key={item.hrefSegment}
                    href={`/${locale}${item.hrefSegment}`}
                    className="rounded-2xl border border-line bg-surface p-5 hover:border-accent/40 transition-colors"
                  >
                    <h3 className="mb-1.5 text-sm font-semibold text-kb-text">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted/70">{item.desc}</p>
                  </a>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* CTA */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                  {t('prodCtaTitle')}
                </h2>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href={`/${locale}/install`}>
                    {t('prodCtaInstallBtn')}
                  </Button>
                  <Button variant="secondary" size="lg" href={`/${locale}/contact`}>
                    {t('prodCtaContactBtn')}
                  </Button>
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
