import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import s from './page.module.css';
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
    title: t('security.meta.title'),
    description: t('security.meta.description'),
    path: '/security',
  });
}

const PILLAR_ICONS = [
  /* on-prem: server/home */
  <svg key="onprem" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="2" width="12" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="3" y="11" width="12" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M9 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="6" cy="4.5" r="0.8" fill="currentColor"/><circle cx="6" cy="13.5" r="0.8" fill="currentColor"/>
  </svg>,
  /* consent: shield with check */
  <svg key="consent" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L2.5 4.5V9c0 3.9 2.8 6.6 6.5 7.5 3.7-.9 6.5-3.6 6.5-7.5V4.5L9 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M6.5 9.5L8 11l3.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  /* open source: code brackets */
  <svg key="oss" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M6 5L2.5 9L6 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 5L15.5 9L12 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 3L8 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>,
];

export default async function SecurityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  type PillarItem = { title: string; description: string };
  type PracticeItem = { title: string; description: string };
  type ComplianceItem = { name: string; status: string; description: string };

  const pillars = t.raw('security.pillars') as PillarItem[];
  const practices = t.raw('security.practices') as PracticeItem[];
  const compliance = t.raw('security.compliance') as ComplianceItem[];
  const statusReady = t('security.statusReady');

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('security.hero.title')}</h1>
          <p>{t('security.hero.subtitle')}</p>
        </section>

        <div className={s.pillars}>
          {pillars.map((p, i) => (
            <div key={p.title} className={s.pillar}>
              <div className={s.pillarIcon}>{PILLAR_ICONS[i]}</div>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
            </div>
          ))}
        </div>

        <hr className={s.divider} />

        <section className={s.practices}>
          <div className={s.practicesLabel}>
            <h2>{t('security.practicesTitle')}</h2>
            <p>{t('security.practicesSubtitle')}</p>
          </div>
          <div className={s.practiceList}>
            {practices.map((p) => (
              <div key={p.title} className={s.practice}>
                <span className={s.practiceTitle}>{p.title}</span>
                <p className={s.practiceDesc}>{p.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        <section className={s.compliance}>
          <h2>{t('security.complianceTitle')}</h2>
          <div className={s.complianceGrid}>
            {compliance.map((c) => {
              const statusClass = c.status === statusReady ? 'ready' : 'planned';
              return (
                <div key={c.name} className={s.complianceItem}>
                  <span className={s.complianceName}>{c.name}</span>
                  <span className={`${s.complianceStatus} ${s[statusClass]}`}>
                    {c.status}
                  </span>
                  <p className={s.complianceDesc}>{c.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="final-cta-block reveal">
          <h2>{t('security.cta.title')}</h2>
          <p>{t('security.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/contact`}>{t('security.cta.contactBtn')}</Link>
            <a className="btn secondary" href="mailto:security@kblabs.ru">{t('security.cta.emailBtn')}</a>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
