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
    title: t('product.meta.title'),
    description: t('product.meta.description'),
    path: '/product',
    imageSegment: 'product',
  });
}

type Pillar = {
  anchor: string;
  eyebrow: string;
  heading: string;
  lead: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
};

export default async function ProductPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const pillarWorkflows = t.raw('product.pillars.workflows') as Pillar;
  const pillarGateway = t.raw('product.pillars.gateway') as Pillar;
  const foundation = t.raw('product.pillars.foundation') as {
    label: string;
    title: string;
    description: string;
  };

  const renderPillar = (p: Pillar) => (
    <section id={p.anchor} className={s.pillarSection}>
      <div className={s.pillarInner}>
        <span className={s.pillarEyebrow}>{p.eyebrow}</span>
        <h2 className={s.pillarHeading}>{p.heading}</h2>
        <p className={s.pillarLead}>{p.lead}</p>
        <ul className={s.pillarBullets}>
          {p.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <Link className={s.pillarCta} href={`/${locale}${p.ctaHref}`}>
          {p.ctaLabel}
        </Link>
      </div>
    </section>
  );

  const exploreItems = [
    {
      href: `/${locale}/product/workflows`,
      title: t('nav.megamenu.platform.workflows.title'),
      desc: t('nav.megamenu.platform.workflows.description'),
    },
    {
      href: `/${locale}/product/plugins`,
      title: t('nav.megamenu.platform.plugins.title'),
      desc: t('nav.megamenu.platform.plugins.description'),
    },
    {
      href: `/${locale}/product/state-broker`,
      title: t('nav.megamenu.platform.stateBroker.title'),
      desc: t('nav.megamenu.platform.stateBroker.description'),
    },
    {
      href: `/${locale}/solutions/release-automation`,
      title: t('nav.megamenu.solutions.releaseAutomation.title'),
      desc: t('nav.megamenu.solutions.releaseAutomation.description'),
    },
    {
      href: `/${locale}/solutions/code-intelligence`,
      title: t('nav.megamenu.solutions.codeIntelligence.title'),
      desc: t('nav.megamenu.solutions.codeIntelligence.description'),
    },
    {
      href: `/${locale}/solutions/code-quality`,
      title: t('nav.megamenu.solutions.codeQuality.title'),
      desc: t('nav.megamenu.solutions.codeQuality.description'),
    },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('product.hero.title')}</h1>
          <p>{t('product.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('product.hero.startBtn')}</Link>
            <a className="btn secondary" href="https://docs.kblabs.ru" target="_blank" rel="noopener noreferrer">{t('product.hero.docsBtn')}</a>
          </div>
        </section>

        {/* ─── Two co-equal pieces ───────────────────────────────────── */}
        {renderPillar(pillarWorkflows)}
        {renderPillar(pillarGateway)}

        {/* ─── Foundation note ───────────────────────────────────────── */}
        <section className={s.foundationSection}>
          <div className={s.foundationInner}>
            <span className={s.foundationLabel}>{foundation.label}</span>
            <h3 className={s.foundationTitle}>{foundation.title}</h3>
            <p className={s.foundationBody}>{foundation.description}</p>
          </div>
        </section>

        {/* ─── Go deeper ─────────────────────────────────────────────── */}
        <section className={s.capabilities}>
          <div className={s.capabilitiesHeader}>
            <h2>{t('product.exploreTitle')}</h2>
            <p>{t('product.exploreDesc')}</p>
          </div>
          <div className={s.capGrid}>
            {exploreItems.map((item) => (
              <Link key={item.href} className={s.capItem} href={item.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta-block reveal">
          <h2>{t('product.cta.title')}</h2>
          <p>{t('product.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('product.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('product.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
