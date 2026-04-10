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
    title: t('enterprise.meta.title'),
    description: t('enterprise.meta.description'),
    path: '/enterprise',
  });
}

const WHY_ICONS = [
  <svg key="bills" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M6 6h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>,
  <svg key="infra" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="2" y="11" width="14" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="13.5" cy="5" r="1" fill="currentColor"/>
    <circle cx="13.5" cy="13" r="1" fill="currentColor"/>
  </svg>,
  <svg key="vendor" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 9h12M11 5l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  <svg key="sla" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2l1.8 5.4H16l-4.5 3.3 1.7 5.3L9 13l-4.2 3 1.7-5.3L2 7.4h5.2L9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>,
  <svg key="compliance" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L2.5 4.5V9c0 3.9 2.8 6.6 6.5 7.5 3.7-.9 6.5-3.6 6.5-7.5V4.5L9 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  <svg key="success" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M3 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>,
];

export default async function EnterprisePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  type WhyItem = { title: string; description: string };
  type FeatureItem = { title: string; description: string };

  const why = t.raw('enterprise.why') as WhyItem[];
  const features = t.raw('enterprise.features') as FeatureItem[];

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('enterprise.hero.title')}</h1>
          <p>{t('enterprise.hero.subtitle')}</p>
        </section>

        <div className={s.values}>
          {why.map((v, i) => (
            <div key={v.title} className={s.valueCard}>
              <div className={s.valueIcon}>{WHY_ICONS[i]}</div>
              <h3>{v.title}</h3>
              <p>{v.description}</p>
            </div>
          ))}
        </div>

        <hr className={s.divider} />

        <section className={s.featureSection}>
          <h2>{t('enterprise.featuresTitle')}</h2>
          <div className={s.featureList}>
            {features.map((f) => (
              <div key={f.title} className={s.featureRow}>
                <span className={s.featureTitle}>{f.title}</span>
                <p className={s.featureDesc}>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        <section className={s.contact}>
          <div className={s.contactText}>
            <h2>{t('enterprise.cta.title')}</h2>
            <p>{t('enterprise.cta.description')}</p>
            <div className={s.contactActions}>
              <Link className="btn primary" href={`/${locale}/contact`}>{t('enterprise.cta.salesBtn')}</Link>
              <a className="btn secondary" href="mailto:sales@kblabs.ru">{t('enterprise.cta.emailBtn')}</a>
            </div>
          </div>
          <div className={s.contactMeta}>
            <div className={s.contactMetaItem}>
              <span className={s.contactMetaLabel}>{t('enterprise.meta2.dealSize')}</span>
              <span className={s.contactMetaValue}>{t('enterprise.meta2.dealSizeValue')}</span>
            </div>
            <div className={s.contactMetaItem}>
              <span className={s.contactMetaLabel}>{t('enterprise.meta2.contractLength')}</span>
              <span className={s.contactMetaValue}>{t('enterprise.meta2.contractLengthValue')}</span>
            </div>
            <div className={s.contactMetaItem}>
              <span className={s.contactMetaLabel}>{t('enterprise.meta2.onboarding')}</span>
              <span className={s.contactMetaValue}>{t('enterprise.meta2.onboardingValue')}</span>
            </div>
            <div className={s.contactMetaItem}>
              <span className={s.contactMetaLabel}>{t('enterprise.meta2.responseTime')}</span>
              <span className={s.contactMetaValue}>{t('enterprise.meta2.responseTimeValue')}</span>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
