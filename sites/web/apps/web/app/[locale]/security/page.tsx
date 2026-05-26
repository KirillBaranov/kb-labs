import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
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
  FeatureCard,
  GlowCard,
  GradientText,
  GridSection,
  Section,
  StatCard,
} from '@kb-labs/web-site-ui';
import {
  Box,
  Code2,
  Cpu,
  EyeOff,
  FileCode2,
  KeyRound,
  MailOpen,
  Server,
  Terminal,
} from 'lucide-react';
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
    title: t('page.secMetaTitle'),
    description: t('page.secMetaDesc'),
    path: '/security',
  });
}

type FlowStatus = 'local' | 'conditional' | 'infra';

const FLOW_DOT: Record<FlowStatus, string> = {
  local:       'bg-emerald-500',
  conditional: 'bg-amber-400',
  infra:       'bg-sky-400',
};

const FLOW_BADGE: Record<FlowStatus, string> = {
  local:       'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  conditional: 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
  infra:       'bg-sky-400/10 text-sky-400 border border-sky-400/20',
};

const SANDBOX_ICONS = [FileCode2, Cpu, Terminal, Box];

const PILLAR_ICONS = [Server, Code2, EyeOff];

export default async function SecurityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const secStats = t.raw('page.secStats') as Array<{ value: string; label: string; description: string }>;
  const secDataFlow = t.raw('page.secDataFlow') as Array<{ dataType: string; destination: string; condition: string; status: FlowStatus }>;
  const secFlowStatus = t.raw('page.secFlowStatus') as Record<FlowStatus, { label: string }>;
  const secPillars = t.raw('page.secPillars') as Array<{ title: string; description: string }>;
  const secSandboxLayers = t.raw('page.secSandboxLayers') as Array<{ num: string; title: string; description: string }>;
  const secAuthFacts = t.raw('page.secAuthFacts') as Array<{ label: string; value: string }>;
  const secComplianceItems = t.raw('page.secComplianceItems') as Array<{ name: string; status: string; statusClass: string; description: string }>;
  const secDisclosureSteps = t.raw('page.secDisclosureSteps') as string[];

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
                <Eyebrow className="mb-4">{t('page.secHeroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('page.secHeroTitle')}{' '}
                  <GradientText>{t('page.secHeroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted/70">
                  {t('page.secHeroDescription')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Stats ── */}
        <section className="border-b border-line bg-surface/40 py-10">
          <Container>
            <AnimateOnScroll>
              <div className="grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4">
                {secStats.map((s, i) => (
                  <div
                    key={i}
                    className={i < secStats.length - 1 ? 'lg:border-r lg:border-line lg:pr-8' : ''}
                  >
                    <StatCard value={s.value} label={s.label} description={s.description} />
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Data flow table ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('page.secDataFlowEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.secDataFlowTitle')}
                </h2>
                <p className="mt-3 text-sm text-muted/60">
                  {t('page.secDataFlowSubtitle')}
                </p>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll delay={60}>
              {/* Legend */}
              <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-5 text-sm text-muted/60">
                {(Object.keys(secFlowStatus) as FlowStatus[]).map((key) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className={`size-2 shrink-0 rounded-full ${FLOW_DOT[key]}`} />
                    {secFlowStatus[key].label}
                  </span>
                ))}
              </div>

              {/* Table */}
              <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-5 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-muted/55 dark:text-muted/40">{t('page.secTableHeaderType')}</th>
                      <th className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-muted/55 dark:text-muted/40">{t('page.secTableHeaderDest')}</th>
                      <th className="hidden px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-muted/55 dark:text-muted/40 sm:table-cell">{t('page.secTableHeaderCond')}</th>
                      <th className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-muted/55 dark:text-muted/40">{t('page.secTableHeaderStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {secDataFlow.map((row) => (
                      <tr key={row.dataType} className="transition-colors hover:bg-surface/80">
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-2 font-medium text-kb-text">
                            <span className={`size-1.5 shrink-0 rounded-full ${FLOW_DOT[row.status]}`} />
                            {row.dataType}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-muted/70">{row.destination}</td>
                        <td className="hidden px-4 py-3.5 text-sm text-muted/50 sm:table-cell">{row.condition}</td>
                        <td className="px-4 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap ${FLOW_BADGE[row.status]}`}>
                            {secFlowStatus[row.status].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Three pillars ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('page.secPillarsEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.secPillarsTitle')}
                </h2>
              </div>
            </AnimateOnScroll>
            <AnimateOnScroll delay={60}>
              <GridSection cols={3}>
                {secPillars.map((pillar, i) => (
                  <FeatureCard
                    key={pillar.title}
                    icon={PILLAR_ICONS[i] ?? Server}
                    title={pillar.title}
                    description={pillar.description}
                  />
                ))}
              </GridSection>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Plugin sandbox ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('page.secSandboxEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.secSandboxTitle')}
                </h2>
                <p className="mt-3 text-sm text-muted/60">
                  {t('page.secSandboxSubtitle')}
                </p>
              </div>
            </AnimateOnScroll>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {secSandboxLayers.map((layer, i) => {
                const Icon = SANDBOX_ICONS[i] ?? Box;
                return (
                  <AnimateOnScroll key={layer.title} delay={i * 50}>
                    <GlowCard className="flex h-full flex-col rounded-2xl border border-line p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex size-9 items-center justify-center rounded-lg border border-line bg-bg text-muted">
                          <Icon size={18} />
                        </div>
                        <span className="font-mono text-[0.65rem] font-bold text-muted/45 dark:text-muted/30">{layer.num}</span>
                      </div>
                      <p className="mb-1.5 text-sm font-semibold text-kb-text">{layer.title}</p>
                      <p className="text-sm leading-relaxed text-muted/60">{layer.description}</p>
                    </GlowCard>
                  </AnimateOnScroll>
                );
              })}
            </div>
          </Container>
        </Section>

        {/* ── Auth facts ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <div className="mx-auto max-w-3xl">
              <AnimateOnScroll>
                <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <Eyebrow className="mb-2">{t('page.secAuthEyebrow')}</Eyebrow>
                    <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                      {t('page.secAuthTitle')}
                    </h2>
                    <p className="mt-2 text-sm text-muted/60">
                      {t('page.secAuthSubtitle')}
                    </p>
                  </div>
                </div>
              </AnimateOnScroll>

              <AnimateOnScroll delay={60}>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <table className="w-full border-collapse text-sm">
                    <tbody className="divide-y divide-line">
                      {secAuthFacts.map((fact) => (
                        <tr key={fact.label} className="transition-colors hover:bg-surface/80">
                          <td className="px-5 py-3.5 text-muted/60">{fact.label}</td>
                          <td className="px-5 py-3.5 text-right font-mono font-medium text-kb-text">{fact.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Compliance ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('page.secComplianceEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('page.secComplianceTitle')}
                </h2>
                <p className="mt-3 text-sm text-muted/60">{t('page.secComplianceSubtitle')}</p>
              </div>
            </AnimateOnScroll>
            <AnimateOnScroll delay={60}>
              <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface divide-y divide-line">
                {secComplianceItems.map((item) => (
                  <div key={item.name} className="px-5 py-4">
                    <div className="mb-1.5 flex items-center gap-3">
                      <span className="text-sm font-semibold text-kb-text">{item.name}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold ${item.statusClass}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted/60">{item.description}</p>
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Responsible disclosure ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <GlowCard className="rounded-2xl border border-line p-8">
                  <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-line bg-bg text-muted">
                    <MailOpen size={20} />
                  </div>
                  <Eyebrow className="mb-2">{t('page.secDisclosureEyebrow')}</Eyebrow>
                  <h2 className="mb-3 text-2xl font-bold tracking-tight text-kb-text">
                    {t('page.secDisclosureTitle')}
                  </h2>
                  <p className="mb-6 text-sm leading-relaxed text-muted/70">
                    {t('page.secDisclosureBody')}
                  </p>
                  <div className="mb-6 space-y-2 rounded-xl border border-line bg-bg px-5 py-4">
                    {secDisclosureSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent/60" />
                        <span className="text-sm text-muted/70">{step}</span>
                      </div>
                    ))}
                  </div>
                  {/* i18n-ignore: email address */}
                  <Button variant="secondary" size="sm" href="mailto:security@kblabs.ru">
                    {t('page.secDisclosureBtn')}
                  </Button>
                </GlowCard>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-5 py-10 sm:px-8 sm:py-16 text-center">
                <BorderBeam />
                <div className="relative z-10">
                  <Eyebrow className="mb-4">{t('page.secCtaEyebrow')}</Eyebrow>
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('page.secCtaTitle')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-md text-base text-muted/60">
                    {t('page.secCtaBody')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/contact`}>
                      {t('page.secCtaContactBtn')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      href="https://github.com/KirillBaranov/kb-labs"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('page.secCtaGithubBtn')}
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
