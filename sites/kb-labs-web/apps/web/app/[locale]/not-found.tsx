'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import s from './not-found.module.css';

export default function NotFound() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      <SiteHeader />
      <main className={s.content}>
        <div className={s.inner}>
          <p className={s.code}>404</p>
          <p className={s.description}>{t('notFound.description')}</p>
          <div className={s.actions}>
            <Link href={`/${locale}`} className={s.btnPrimary}>
              {t('notFound.goHome')}
            </Link>
            <Link href={`/${locale}/contact`} className={s.btnGhost}>
              {t('notFound.contact')}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
