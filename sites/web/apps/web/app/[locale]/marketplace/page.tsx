import type { Metadata } from 'next';

import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { routing } from '@/i18n/routing';
import { MarketplaceCatalog } from './MarketplaceCatalog';
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
    title: t('marketplace.meta.title'),
    description: t('marketplace.meta.description'),
    path: '/marketplace',
    imageSegment: 'marketplace',
  });
}

export default async function MarketplacePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <section className={s.hero}>
          <div className={s.heroInner}>
            <span className={s.eyebrow}>Marketplace</span>
            <h1 className={s.title}>Extend KB Labs your way</h1>
            <p className={s.subtitle}>
              Plugins, adapters, widgets, and hooks — install any extension with a single command.
            </p>
            <p className={s.earlyTag}>
              Currently showing official extensions. Community submissions opening soon.
            </p>
          </div>
        </section>

        <section className={s.catalogSection}>
          <MarketplaceCatalog />
        </section>

        <section className={s.ctaSection}>
          <div className={s.ctaInner}>
            <h2 className={s.ctaTitle}>Build your own plugin</h2>
            <p className={s.ctaDesc}>
              Scaffold a plugin in one command, wire it into the platform, and share it.
              Everything ships as a regular npm package.
            </p>
            <div className={s.ctaActions}>
              <Link className="btn primary" href={`/${locale}/install`}>Install KB Labs</Link>
              <a className="btn secondary" href="https://docs.kblabs.ru/guides/first-plugin" target="_blank" rel="noopener noreferrer">Plugin guide</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
