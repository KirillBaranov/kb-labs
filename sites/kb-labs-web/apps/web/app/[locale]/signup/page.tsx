import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { WaitlistForm } from '@/components/WaitlistForm';
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
    title: t('signup.meta.title'),
    description: t('signup.meta.description'),
    path: '/signup',
  });
}

type Perk = {
  label: string;
  description: string;
};

export default async function SignupPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const perks = t.raw('signup.perks') as Perk[];

  return (
    <>
      <SiteHeader />
      <main className={s.main}>
        <div className={s.card}>
          <div className={s.left}>
            <span className={s.eyebrow}>{t('signup.eyebrow')}</span>
            <h1 className={s.title}>{t('signup.title')}</h1>
            <p className={s.desc}>{t('signup.description')}</p>
            <ul className={s.perks}>
              {perks.map((p) => (
                <li key={p.label} className={s.perk}>
                  <svg className={s.perkIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity=".2"/>
                    <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div>
                    <span className={s.perkLabel}>{p.label}</span>
                    <span className={s.perkDesc}>{p.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={s.right}>
            <h2 className={s.formTitle}>{t('signup.form.title')}</h2>
            <p className={s.formDesc}>{t('signup.form.description')}</p>
            <WaitlistForm size="large" />
            <p className={s.formNote}>
              {t.rich('signup.form.note', {
                privacyLink: (chunks) => (
                  <Link href={`/${locale}/legal/privacy`}>{chunks}</Link>
                ),
              })}
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
