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
    title: t('pricing.meta.title'),
    description: t('pricing.meta.description'),
    path: '/pricing',
  });
}

type TierData = {
  name: string;
  badge?: string;
  price: string;
  note: string;
  cta: string;
  ctaHref: string;
  features: string[];
};

type ComparisonRow = {
  feature: string;
  hobby: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
};

type ComparisonCategory = {
  label: string;
  rows: ComparisonRow[];
};

type FaqItem = {
  q: string;
  a: string;
};

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const hobbyRaw = t.raw('pricing.tiers.hobby') as TierData;
  const proRaw = t.raw('pricing.tiers.pro') as TierData;
  const enterpriseRaw = t.raw('pricing.tiers.enterprise') as TierData;

  const TIERS = [
    { ...hobbyRaw, badge: null as string | null, featured: false },
    { ...proRaw, badge: proRaw.badge ?? null, featured: true },
    { ...enterpriseRaw, badge: null as string | null, featured: false },
  ];

  const comparisonCategories = t.raw('pricing.comparison.categories') as Record<string, ComparisonCategory>;
  const COMPARISON = Object.values(comparisonCategories);

  const FAQ = t.raw('pricing.faq.items') as FaqItem[];

  const yesSymbol = t('pricing.comparison.yes');
  const noSymbol = t('pricing.comparison.no');

  function renderCell(value: string | boolean): string {
    if (value === true) return yesSymbol;
    if (value === false) return noSymbol;
    return String(value);
  }

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('pricing.hero.title')}</h1>
          <p>{t('pricing.hero.subtitle')}</p>
        </section>

        <section className={s.tiers}>
          {TIERS.map((tier) => (
            <div key={tier.name} className={`${s.tierCard}${tier.featured ? ` ${s.tierCardFeatured}` : ''}`}>
              <div className={s.tierHead}>
                <div className={s.tierNameRow}>
                  <span className={s.tierName}>{tier.name}</span>
                  {tier.badge && <span className={s.tierBadge}>{tier.badge}</span>}
                </div>
                <div className={s.tierPrice}>{tier.price}</div>
                <div className={s.tierNote}>{tier.note}</div>
              </div>
              <Link
                className={`${s.tierCta} ${tier.featured ? s.tierCtaPrimary : s.tierCtaSecondary}`}
                href={`/${locale}${tier.ctaHref}`}
              >
                {tier.cta}
              </Link>
              <ul className={s.tierFeatures}>
                {tier.features.map((f) => (
                  <li key={f}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <path d="M2.5 7.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className={s.compare}>
          <h2>{t('pricing.comparison.title')}</h2>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>{t('pricing.tiers.hobby.name')}</th>
                  <th>{t('pricing.tiers.pro.name')}</th>
                  <th>{t('pricing.tiers.enterprise.name')}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((section) => (
                  <>
                    <tr key={section.label} className={s.categoryRow}>
                      <td colSpan={4}>{section.label}</td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.feature}>
                        <td>{row.feature}</td>
                        <td>{renderCell(row.hobby)}</td>
                        <td>{renderCell(row.pro)}</td>
                        <td>{renderCell(row.enterprise)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={s.faq}>
          <h2>{t('pricing.faq.title')}</h2>
          <dl className={s.faqList}>
            {FAQ.map((item) => (
              <div key={item.q} className={s.faqRow}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="final-cta-block reveal">
          <h2>{t('pricing.cta.title')}</h2>
          <p>{t('pricing.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('pricing.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('pricing.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
