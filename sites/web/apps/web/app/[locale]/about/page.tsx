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
    title: t('about.meta.title'),
    description: t('about.meta.description'),
    path: '/about',
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const manifesto = t.raw('about.manifesto') as string[];
  const principles = t.raw('about.principles') as { num: string; title: string; body: string }[];
  const origin = t.raw('about.origin') as string[];

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('about.hero.title')}</h1>
          <p>{t('about.hero.subtitle')}</p>
        </section>

        <aside className={s.founderBlock}>
          <span className={s.founderLabel}>{t('about.founder.label')}</span>
          <h2 className={s.founderName}>{t('about.founder.name')}</h2>
          <p className={s.founderBio}>{t('about.founder.bio')}</p>
          <div className={s.founderLinks}>
            <a href="https://k-baranov.ru" target="_blank" rel="noopener noreferrer">{t('about.founder.links.site')}</a>
            <a href="https://github.com/KirillBaranov" target="_blank" rel="noopener noreferrer">{t('about.founder.links.github')}</a>
            <a href="https://twitter.com/kblabs_dev" target="_blank" rel="noopener noreferrer">{t('about.founder.links.twitter')}</a>
          </div>
        </aside>

        <section className={s.manifesto}>
          <p
            className={s.manifestoLead}
            dangerouslySetInnerHTML={{ __html: manifesto[0] }}
          />
          <div className={s.manifestoBody}>
            {manifesto.slice(1).map((para, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: para }} />
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        <section className={s.principles}>
          <div className={s.principlesHeader}>
            <h2>{t('about.principlesTitle')}</h2>
          </div>
          <div className={s.principleGrid}>
            {principles.map((p) => (
              <div key={p.num} className={s.principle}>
                <span className={s.principleNum}>{p.num}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        <div className={s.origin}>
          <span className={s.originLabel}>{t('about.originLabel')}</span>
          <div className={s.originBody}>
            {origin.map((para, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: para }} />
            ))}
          </div>
        </div>

        <section className="final-cta-block reveal">
          <h2>{t('about.cta.title')}</h2>
          <p>{t('about.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('about.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('about.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
