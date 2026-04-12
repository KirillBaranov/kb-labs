import type { Metadata } from 'next';
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
    title: t('changelog.meta.title'),
    description: t('changelog.meta.description'),
    path: '/changelog',
    imageSegment: 'changelog',
  });
}

type ChangeItem = {
  type: 'new' | 'improved' | 'fixed';
  text: string;
};

type Release = {
  version: string;
  date: string;
  summary: string;
  changes: ChangeItem[];
};

export default async function ChangelogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const releases = t.raw('changelog.releases') as Release[];

  const typeLabel: Record<ChangeItem['type'], string> = {
    new: t('changelog.typeNew'),
    improved: t('changelog.typeImproved'),
    fixed: t('changelog.typeFixed'),
  };

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('changelog.hero.title')}</h1>
          <p>{t('changelog.hero.subtitle')}</p>
        </section>

        <div className={s.releases}>
          {releases.map((release) => (
            <div key={release.version} className={s.release}>
              <div className={s.releaseMeta}>
                <span className={s.releaseVersion}>{release.version}</span>
                <span className={s.releaseDate}>{release.date}</span>
              </div>
              <div className={s.releaseBody}>
                <p className={s.releaseSummary}>{release.summary}</p>
                <ul className={s.changeList}>
                  {release.changes.map((item, i) => (
                    <li key={i} className={s.changeItem}>
                      <span className={`${s.changeType} ${s[item.type]}`}>
                        {typeLabel[item.type]}
                      </span>
                      <span className={s.changeText}>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

      </main>
      <SiteFooter />
    </>
  );
}
