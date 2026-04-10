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
    title: t('compare.meta.title'),
    description: t('compare.meta.description'),
    path: '/compare',
  });
}

export default async function ComparePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const alternatives = t.raw('compare.alternatives') as {
    id: string;
    label: string;
    title: string;
    body: string[];
    note?: string;
  }[];

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <span className={s.eyebrow}>{t('compare.eyebrow')}</span>
          <h1>{t('compare.hero.title')}</h1>
          <p>{t('compare.hero.subtitle')}</p>
        </section>

        <div className={s.list}>
          {alternatives.map((alt, i) => (
            <section key={alt.id} className={`${s.item} reveal`}>
              <div className={s.itemMeta}>
                <span className={s.itemNum}>0{i + 1}</span>
                <span className={s.itemLabel}>{alt.label}</span>
              </div>
              <div className={s.itemContent}>
                <h2>{alt.title}</h2>
                <div className={s.itemBody}>
                  {alt.body.map((para, j) => (
                    <p key={j}>{para}</p>
                  ))}
                </div>
                {alt.note && (
                  <p className={s.itemNote}>{alt.note}</p>
                )}
              </div>
            </section>
          ))}
        </div>

        <section className="final-cta-block reveal">
          <h2>{t('compare.cta.title')}</h2>
          <p>{t('compare.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('compare.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('compare.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
