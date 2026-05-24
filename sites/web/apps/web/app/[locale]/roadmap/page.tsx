import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import { Container, Section } from '@kb-labs/web-site-ui';

type Props = { params: Promise<{ locale: string }> };

type Quarter = {
  id: string;
  label: string;
  theme: string;
  status: 'shipped' | 'in-progress' | 'planned' | 'exploring';
  items: Array<{
    title: string;
    description: string;
    status: 'shipped' | 'in-progress' | 'planned' | 'exploring';
  }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('roadmap.meta.title'),
    description: t('roadmap.meta.description'),
    path: '/roadmap',
  });
}

const statusStyles: Record<string, { badge: string; dot: string }> = {
  shipped:     { badge: 'bg-accent/15 text-accent border-accent/20',           dot: 'bg-accent' },
  'in-progress': { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',   dot: 'bg-blue-400' },
  planned:     { badge: 'bg-muted/10 text-muted/60 border-line',               dot: 'bg-muted/40' },
  exploring:   { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
};

const statusLabel: Record<string, string> = {
  shipped: 'Shipped',
  'in-progress': 'In Progress',
  planned: 'Planned',
  exploring: 'Exploring',
};

function getProgress(q: Quarter): { done: number; total: number } {
  const total = q.items.length;
  const done = q.items.filter((i) => i.status === 'shipped').length;
  return { done, total };
}

export default async function RoadmapPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const quarters = t.raw('roadmap.quarters') as Quarter[];

  return (
    <>
      <SiteHeader />
      <main>

        <Section className="border-b border-line">
          <Container>
            <div className="py-16 text-center">
              <h1 className="text-4xl font-bold tracking-tight text-kb-text sm:text-5xl">
                {t('roadmap.hero.title')}
              </h1>
              <p className="mt-4 text-lg text-muted/70">{t('roadmap.hero.description')}</p>
            </div>
          </Container>
        </Section>

        {/* Quarter nav pills */}
        <div className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <Container>
            <nav className="flex gap-2 overflow-x-auto py-3 scrollbar-none">
              {quarters.map((q) => {
                const isCurrent = q.status === 'in-progress';
                const st = statusStyles[q.status];
                return (
                  <a
                    key={q.id}
                    href={`#${q.id}`}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${st.badge} ${isCurrent ? 'ring-1 ring-blue-400/40' : ''}`}
                  >
                    {isCurrent && <span className={`size-1.5 rounded-full ${st.dot} animate-pulse`} />}
                    {q.label}
                  </a>
                );
              })}
            </nav>
          </Container>
        </div>

        {/* Legend */}
        <Container>
          <div className="flex flex-wrap gap-2 py-5">
            {(['shipped', 'in-progress', 'planned', 'exploring'] as const).map((key) => {
              const st = statusStyles[key];
              return (
                <span key={key} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium ${st.badge}`}>
                  <span className={`size-1.5 rounded-full ${st.dot}`} />
                  {statusLabel[key]}
                </span>
              );
            })}
          </div>
        </Container>

        {/* Timeline */}
        <Section>
          <Container>
            <div className="flex flex-col gap-8 pb-16">
              {quarters.map((q) => {
                const { done, total } = getProgress(q);
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const isCurrent = q.status === 'in-progress';
                const st = statusStyles[q.status];

                return (
                  <div
                    key={q.id}
                    id={q.id}
                    className={`rounded-xl border bg-surface/20 ${isCurrent ? 'border-blue-500/30 ring-1 ring-blue-500/10' : 'border-line'}`}
                  >
                    {/* Quarter header */}
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-kb-text">{q.label}</h2>
                          {isCurrent && (
                            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-blue-400">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted/60">{q.theme}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.badge}`}>
                          {statusLabel[q.status]}
                        </span>
                        {(q.status === 'shipped' || q.status === 'in-progress') && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted/50">{done}/{total}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Items */}
                    <ul className="divide-y divide-line">
                      {q.items.map((item, i) => {
                        const ist = statusStyles[item.status];
                        return (
                          <li key={i} className="flex flex-col gap-1.5 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-kb-text">{item.title}</span>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${ist.badge}`}>
                                {statusLabel[item.status]}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed text-muted/60">{item.description}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Container>
        </Section>

        {/* CTA */}
        <Section className="border-t border-line bg-surface/40">
          <Container>
            <div className="py-16 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-kb-text sm:text-3xl">
                {t('roadmap.cta.title')}
              </h2>
              <p className="mt-4 text-base text-muted/70">{t('roadmap.cta.description')}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/${locale}/install`}
                  className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {t('roadmap.cta.startBtn')}
                </Link>
                <Link
                  href={`/${locale}/contact`}
                  className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-kb-text transition-colors hover:bg-surface"
                >
                  {t('roadmap.cta.contactBtn')}
                </Link>
              </div>
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
