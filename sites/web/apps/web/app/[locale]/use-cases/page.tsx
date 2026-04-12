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
    title: t('useCases.meta.title'),
    description: t('useCases.meta.description'),
    path: '/use-cases',
  });
}

type UseCaseItem = {
  title: string;
  hook: string;
  situation: string;
  how: string;
  result: string;
  owner: string;
};

export default async function UseCasesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const items = t.raw('useCases.items') as UseCaseItem[];

  return (
    <>
      <SiteHeader />
      <main className="page">
        <section className={s.hero}>
          <p className={s.heroEyebrow}>{t('useCases.meta.title')}</p>
          <h1>{t('useCases.hero.title')}</h1>
          <p className={s.heroSub}>{t('useCases.hero.subtitle')}</p>
        </section>

        <div className={s.list}>
          {items.map((item, index) => (
            <article key={item.title} className={s.story}>
              <div className={s.storyIndex}>
                <span className={s.storyNum}>0{index + 1}</span>
              </div>
              <div className={s.storyBody}>
                <p className={s.storyHook}>{item.hook}</p>
                <h2 className={s.storyTitle}>{item.title}</h2>
                <div className={s.storyGrid}>
                  <div className={s.storyCol}>
                    <span className={s.storyLabel}>{t('useCases.labels.situation')}</span>
                    <p className={s.storyText}>{item.situation}</p>
                  </div>
                  <div className={s.storyColDivider} aria-hidden />
                  <div className={s.storyCol}>
                    <span className={s.storyLabel}>{t('useCases.labels.how')}</span>
                    <p className={s.storyText}>{item.how}</p>
                  </div>
                  <div className={s.storyColDivider} aria-hidden />
                  <div className={s.storyCol}>
                    <span className={s.storyLabel}>{t('useCases.labels.result')}</span>
                    <p className={`${s.storyText} ${s.storyResult}`}>{item.result}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="container">
          <section className="final-cta-block reveal">
            <h2>{t('useCases.cta.title')}</h2>
            <p>{t('useCases.cta.description')}</p>
            <div className="cta-row">
              <Link className="btn primary" href={`/${locale}/install`}>{t('useCases.cta.installBtn')}</Link>
              <Link className="btn secondary" href={`/${locale}/contact`}>{t('useCases.cta.contactBtn')}</Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
