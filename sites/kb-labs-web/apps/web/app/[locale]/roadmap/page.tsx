import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import s from './page.module.css';
import { buildPageMetadata } from '@/lib/page-metadata';

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

const statusClass: Record<string, string> = {
  shipped: s.statusShipped,
  'in-progress': s.statusInProgress,
  planned: s.statusPlanned,
  exploring: s.statusExploring,
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

        <section className={s.hero}>
          <h1>{t('roadmap.hero.title')}</h1>
          <p>{t('roadmap.hero.description')}</p>
        </section>

        {/* ── Horizontal quarter nav ── */}
        <nav className={s.quarterNav}>
          <div className={s.quarterNavInner}>
            {quarters.map((q) => {
              const isCurrent = q.status === 'in-progress';
              return (
                <a
                  key={q.id}
                  href={`#${q.id}`}
                  className={`${s.quarterPill} ${statusClass[q.status]} ${isCurrent ? s.quarterCurrent : ''}`}
                >
                  <span className={s.quarterPillLabel}>{q.label}</span>
                  {isCurrent && <span className={s.currentDot} />}
                </a>
              );
            })}
          </div>
        </nav>

        {/* ── Legend ── */}
        <section className={s.legend}>
          {(['shipped', 'in-progress', 'planned', 'exploring'] as const).map((key) => (
            <span key={key} className={`${s.legendPill} ${statusClass[key]}`}>
              {statusLabel[key]}
            </span>
          ))}
        </section>

        {/* ── Timeline ── */}
        <section className={s.timeline}>
          {quarters.map((q) => {
            const { done, total } = getProgress(q);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isCurrent = q.status === 'in-progress';

            return (
              <div
                key={q.id}
                id={q.id}
                className={`${s.quarterCard} ${isCurrent ? s.quarterCardCurrent : ''}`}
              >
                <div className={s.quarterHeader}>
                  <div>
                    <h2 className={s.quarterLabel}>
                      {q.label}
                      {isCurrent && <span className={s.currentBadge}>Current</span>}
                    </h2>
                    <span className={s.quarterTheme}>{q.theme}</span>
                  </div>
                  <div className={s.quarterMeta}>
                    <span className={`${s.badge} ${statusClass[q.status]}`}>
                      {statusLabel[q.status]}
                    </span>
                    {(q.status === 'shipped' || q.status === 'in-progress') && (
                      <div className={s.progressWrap}>
                        <div className={s.progressBar}>
                          <div className={s.progressFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={s.progressLabel}>{done}/{total}</span>
                      </div>
                    )}
                  </div>
                </div>

                <ul className={s.itemList}>
                  {q.items.map((item, i) => (
                    <li key={i} className={s.item}>
                      <div className={s.itemTop}>
                        <span className={s.itemTitle}>{item.title}</span>
                        <span className={`${s.badgeSmall} ${statusClass[item.status]}`}>
                          {statusLabel[item.status]}
                        </span>
                      </div>
                      <p className={s.itemDesc}>{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="final-cta-block reveal">
          <h2>{t('roadmap.cta.title')}</h2>
          <p>{t('roadmap.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('roadmap.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('roadmap.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
