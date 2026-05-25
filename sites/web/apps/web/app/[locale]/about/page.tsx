import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  Container,
  DotPattern,
  Eyebrow,
  GlowCard,
  GradientText,
  Section,
  StatCard,
} from '@kb-labs/web-site-ui';
import {
  Code2,
  Layers,
  Lock,
  Server,
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
    title: t('about.meta.title'),
    description: t('about.meta.description'),
    path: '/about',
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const STATS = (t.raw('about.page.stats') as Array<{ value: string; label: string; description: string }>);

  const TIMELINE = (t.raw('about.page.timeline') as Array<{ period: string; event: string }>).map(
    (item, i) => ({ ...item, current: i === 4 }),
  );

  const WHY_ICONS = [Lock, Code2, Server, Layers];
  const WHYS = (t.raw('about.page.whys') as Array<{ title: string; body: string }>).map(
    (w, i) => ({ ...w, icon: WHY_ICONS[i] }),
  );

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl">
                <Eyebrow className="mb-5">{t('about.page.eyebrow')}</Eyebrow>
                <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('about.page.titleStart')}{' '}
                  <GradientText>{t('about.page.titleGradient')}</GradientText>
                  {' '}{t('about.page.titleEnd')}
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('about.page.subtitle')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Stats ── */}
        <section className="border-b border-line bg-surface/40 py-10">
          <Container>
            <AnimateOnScroll>
              <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
                {STATS.map((s, i) => (
                  <div
                    key={i}
                    className={i < STATS.length - 1 ? 'lg:border-r lg:border-line lg:pr-8' : ''}
                  >
                    <StatCard value={s.value} label={s.label} description={s.description} />
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Story + Timeline ── */}
        <Section className="border-b border-line">
          <Container>
            <div className="mx-auto max-w-4xl">
              <AnimateOnScroll>
                <div className="grid gap-12 lg:grid-cols-[1fr,280px]">

                  {/* Story */}
                  <div>
                    <Eyebrow className="mb-4">{t('about.page.storyEyebrow')}</Eyebrow>
                    <h2 className="mb-6 text-3xl font-bold tracking-tight text-kb-text">{t('about.page.storyTitle')}</h2>
                    <div className="space-y-4 text-base leading-relaxed text-muted/70">
                      <p>{t('about.page.storyPara1')}</p>
                      <p>{t('about.page.storyPara2')}</p>
                      <p>{t('about.page.storyPara3')}</p>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <p className="mb-5 text-[0.65rem] font-semibold uppercase tracking-widest text-muted/40">
                      {t('about.page.timelineLabel')}
                    </p>
                    <div className="flex flex-col">
                      {TIMELINE.map((item, i) => {
                        const currentIdx = TIMELINE.findIndex(t => t.current);
                        const isDone = i < currentIdx;
                        return (
                          <div key={i} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`mt-1 size-2 shrink-0 rounded-full border-2 ${
                                item.current
                                  ? 'border-accent bg-accent ring-2 ring-accent/20 ring-offset-1 ring-offset-bg'
                                  : isDone
                                    ? 'border-emerald-500 bg-emerald-500'
                                    : 'border-line bg-surface'
                              }`} />
                              {i < TIMELINE.length - 1 && (
                                <div className="mt-1 w-px flex-1 bg-line" style={{ minHeight: '2rem' }} />
                              )}
                            </div>
                            <div className="pb-5">
                              <p className={`mb-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-wider ${
                                item.current ? 'text-accent' : 'text-muted/40'
                              }`}>
                                {item.period}
                                {item.current && (
                                  <span className="ml-2 rounded-full border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[0.6rem] text-accent">
                                    {t('about.page.timelineNow')}
                                  </span>
                                )}
                              </p>
                              <p className="text-sm leading-relaxed text-muted/60">{item.event}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </AnimateOnScroll>
            </div>
          </Container>
        </Section>

        {/* ── Four whys ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto mb-10 max-w-xl text-center">
                <Eyebrow className="mb-3">{t('about.page.whysEyebrow')}</Eyebrow>
                <h2 className="text-3xl font-bold tracking-tight text-kb-text">
                  {t('about.page.whysTitle')}
                </h2>
              </div>
            </AnimateOnScroll>
            <div className="grid gap-4 sm:grid-cols-2">
              {WHYS.map((w, i) => {
                const Icon = w.icon;
                return (
                  <AnimateOnScroll key={i} delay={i * 60}>
                    <GlowCard className="flex h-full gap-4 rounded-2xl border border-line p-5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg text-muted">
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-sm font-semibold text-kb-text">{w.title}</p>
                        <p className="text-sm leading-relaxed text-muted/60">{w.body}</p>
                      </div>
                    </GlowCard>
                  </AnimateOnScroll>
                );
              })}
            </div>
          </Container>
        </Section>

        {/* ── Pull quote ── */}
        <section className="border-b border-line py-16">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-2xl font-bold leading-snug tracking-tight text-kb-text sm:text-3xl lg:text-[2.2rem]">
                  {t('about.page.pullQuote')}{' '}
                  <span className="text-muted/40">{t('about.page.pullQuoteMuted')}</span>
                </p>
                <p className="mt-5 text-sm text-muted/50">
                  {t('about.page.pullQuoteAuthor')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Founder ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <GlowCard className="rounded-2xl border border-line p-8">
                  <div className="mb-6 flex items-start gap-5">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl font-bold tracking-tighter text-accent">
                      {t('about.page.founderInitials')}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-kb-text">
                        {/* i18n-ignore */}
                        Kirill Baranov
                      </h2>
                      <p className="text-sm text-muted/50">{t('about.page.founderTitle')}</p>
                    </div>
                  </div>

                  <div className="mb-6 space-y-3 text-sm leading-relaxed text-muted/70">
                    <p>{t('about.page.founderBio1')}</p>
                    <p>{t('about.page.founderBio2')}</p>
                  </div>

                  <div className="mb-6 rounded-xl border border-line bg-bg px-5 py-4">
                    <p className="text-sm font-medium leading-relaxed text-kb-text">
                      {t('about.page.founderQuote')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <a href="https://k-baranov.ru" target="_blank" rel="noopener noreferrer"
                      className="text-sm text-muted/50 transition-colors hover:text-kb-text">
                      {/* i18n-ignore */}
                      k-baranov.ru
                    </a>
                    <span className="text-muted/20">·</span>
                    <a href="https://github.com/KirillBaranov" target="_blank" rel="noopener noreferrer"
                      className="text-sm text-muted/50 transition-colors hover:text-kb-text">
                      {/* i18n-ignore */}
                      GitHub
                    </a>
                    <span className="text-muted/20">·</span>
                    <a href="https://twitter.com/kblabs_dev" target="_blank" rel="noopener noreferrer"
                      className="text-sm text-muted/50 transition-colors hover:text-kb-text">
                      {/* i18n-ignore */}
                      X / Twitter
                    </a>
                  </div>
                </GlowCard>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* ── Follow the journey ── */}
        <Section className="border-b border-line bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <p className="text-base leading-relaxed text-muted/60">
                  {t('about.page.journeyText')}{' '}
                  <a href="https://github.com/KirillBaranov/kb-labs/discussions" target="_blank" rel="noopener noreferrer"
                    className="text-kb-text underline underline-offset-4 decoration-muted/30 hover:decoration-accent transition-colors">
                    {t('about.page.journeyGhDiscussions')}
                  </a>{' '}{t('about.page.journeyOr')}{' '}
                  <a href="https://twitter.com/kblabs_dev" target="_blank" rel="noopener noreferrer"
                    className="text-kb-text underline underline-offset-4 decoration-muted/30 hover:decoration-accent transition-colors">
                    {t('about.page.journeyTwitter')}
                  </a>.
                  {' '}{t('about.page.journeyContact')}{' '}
                  <a href={`/${locale}/contact`}
                    className="text-kb-text underline underline-offset-4 decoration-muted/30 hover:decoration-accent transition-colors">
                    {t('about.page.journeyContactLink')}
                  </a>.
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
