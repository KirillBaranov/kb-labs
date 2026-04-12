import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
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
    title: t('productStudio.meta.title'),
    description: t('productStudio.meta.description'),
    path: '/product/studio',
  });
}

export default async function StudioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <>
      <SiteHeader />
      <main className="page">
        <section className="wf-section">
          <div className="wf-head reveal">
            <div className="wf-head-left">
              <h1 className="wf-title">{t('productStudio.hero.title')}</h1>
              <p className="wf-lead">{t('productStudio.hero.description')}</p>
            </div>
          </div>
        </section>

        <section className="final-cta-block reveal">
          <h2>{t('productStudio.cta.title')}</h2>
          <p>{t('productStudio.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('productStudio.cta.installBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('productStudio.cta.contactBtn')}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
