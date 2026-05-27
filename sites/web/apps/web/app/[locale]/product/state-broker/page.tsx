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
import { ExternalLink } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'stateBroker' });
  return buildPageMetadata({
    locale,
    title: t('metaTitle'),
    description: t('metaDesc'),
    path: '/product/state-broker',
    imageSegment: 'product/state-broker',
  });
}

// ── Code example ─────────────────────────────────────────────────────────────

const API_CODE = `\
# Store state with TTL (milliseconds, default 300 000 = 5 min)
PUT /state/tenant:default:mind:conv-abc
Content-Type: application/json

{ "value": { "lastReply": "Hello!", "turn": 3 }, "ttl": 300000 }

# 204 No Content

# Read back
GET /state/tenant:default:mind:conv-abc

# → { "lastReply": "Hello!", "turn": 3 }

# Clear an entire namespace
POST /state/clear?pattern=tenant:default:mind:*

# 204 No Content`;

type ModeItem = {
  badge: string;
  badgeCls: string;
  title: string;
  when: string;
  detail: string;
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StateBrokerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'stateBroker' });
  const stateModes = t.raw('modes') as ModeItem[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden py-24 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <div className="mx-auto max-w-2xl text-center">
              {/* i18n-ignore: brand + port label */}
              <Eyebrow className="mb-4">State · :7777</Eyebrow>
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                {t('heroTitle')}{' '}
                <GradientText>{t('heroTitleHighlight')}</GradientText>
              </h1>
              <p className="mb-8 text-lg leading-relaxed text-muted/70">
                {t('heroDescription')}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <a href={`/${locale}/install`}>{t('heroInstallBtn')}</a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                    {t('heroDocsBtn')}
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </Container>
        </section>

        {/* ── Modes ── */}
        <Section className="border-t border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-12 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('modesEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('modesTitle')}
                </h2>
              </div>
            </AnimateOnScroll>

            <div className="grid gap-6 lg:grid-cols-3">
              {stateModes.map((item, i) => (
                <AnimateOnScroll key={item.badge} delay={i * 80}>
                  <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                    <span className={`mb-4 self-start rounded-md px-2.5 py-1 font-mono text-[0.68rem] font-medium ring-1 ring-inset ${item.badgeCls}`}>
                      {item.badge}
                    </span>
                    <h3 className="mb-1 text-base font-semibold text-kb-text">{item.title}</h3>
                    <p className="mb-3 text-sm text-accent/70">{item.when}</p>
                    <p className="mt-auto text-sm leading-relaxed text-muted/60">{item.detail}</p>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        {/* ── API ── */}
        <Section className="bg-surface/50">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <AnimateOnScroll>
                {/* i18n-ignore: HTTP acronym label */}
                <Eyebrow className="mb-3">HTTP API</Eyebrow>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-kb-text">
                  {t('apiTitle')}
                </h2>
                <p className="mb-6 text-base leading-relaxed text-muted/70">
                  {t('apiLead')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                    {t('apiDocsBtn')}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              </AnimateOnScroll>

              <AnimateOnScroll delay={100}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <CodeBlock
                    code={API_CODE}
                    language="bash"
                  />
                </div>
              </AnimateOnScroll>
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
                  <p className="mx-auto mb-8 max-w-[44ch] text-[1.05rem] leading-[1.7] text-muted">
                    {t('ctaDescription')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('ctaInstallBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href="https://docs.kblabs.ru/state-broker" target="_blank" rel="noopener noreferrer">
                      {t('ctaDocsBtn')}
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
