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
  const t = await getTranslations({ locale, namespace: 'solutionCodeQuality' });
  return buildPageMetadata({
    locale,
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/solutions/code-quality',
    imageSegment: 'solutions',
  });
}

// ── Content ───────────────────────────────────────────────────────────────────

// i18n-ignore: terminal commands
const INSTALL_ALL = `kb marketplace install @kb-labs/qa-entry
kb marketplace install @kb-labs/quality-entry
kb marketplace install @kb-labs/review-entry`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CodeQualityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'solutionCodeQuality' });

  const pipeline = t.raw('page.pipeline') as Array<{ step: string; cmd: string; desc: string }>;
  const layers = t.raw('page.layers') as Array<{
    eyebrow: string;
    title: string;
    body: string;
    commands: Array<{ cmd: string; note: string }>;
    install: string;
  }>;

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
                <Eyebrow className="mb-4">{t('page.heroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('page.heroTitle')}{' '}
                  <GradientText>{t('page.heroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('page.heroDescription')}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="lg" href="https://docs.kblabs.ru/plugins/quality" target="_blank" rel="noopener noreferrer">
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

        {/* ── Pipeline ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('page.pipelineEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.pipelineTitle')}
                </h2>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll delay={60}>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                {pipeline.map((p, i) => (
                  <div
                    key={p.step}
                    className={`flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-baseline sm:gap-6 ${i < pipeline.length - 1 ? 'border-b border-line' : ''}`}
                  >
                    <span className="w-24 flex-shrink-0 text-sm font-semibold uppercase tracking-widest text-muted/40">
                      {p.step}
                    </span>
                    <code className="flex-shrink-0 font-mono text-[0.8rem] font-semibold text-kb-text/85 sm:w-72">
                      {p.cmd}
                    </code>
                    <span className="text-sm leading-relaxed text-muted/50">{p.desc}</span>
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Three layers ── */}
        {layers.map((layer, li) => (
          <Section key={layer.eyebrow} className={`border-b border-line${li % 2 === 1 ? ' bg-surface/40' : ''}`}>
            <Container>
              <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
                <AnimateOnScroll className={li % 2 === 1 ? 'lg:order-2' : ''}>
                  <Eyebrow className="mb-3">{layer.eyebrow}</Eyebrow>
                  <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                    {layer.title}
                  </h2>
                  <p className="text-base leading-relaxed text-muted/70">
                    {layer.body}
                  </p>
                </AnimateOnScroll>

                <AnimateOnScroll delay={80} className={li % 2 === 1 ? 'lg:order-1' : ''}>
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                    {layer.commands.map((c, i) => (
                      <div
                        key={c.cmd}
                        className={`flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4 ${i < layer.commands.length - 1 ? 'border-b border-line' : ''}`}
                      >
                        <code className="flex-shrink-0 font-mono text-[0.8rem] text-kb-text/85 sm:w-64">{c.cmd}</code>
                        <span className="text-sm leading-relaxed text-muted/50">{c.note}</span>
                      </div>
                    ))}
                  </div>
                </AnimateOnScroll>
              </div>
            </Container>
          </Section>
        ))}

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
                  <div className="mx-auto mb-8 max-w-xl overflow-hidden rounded-xl border border-line bg-surface">
                    <CodeBlock code={INSTALL_ALL} language="bash" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href="https://docs.kblabs.ru/plugins/quality" target="_blank" rel="noopener noreferrer">
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
