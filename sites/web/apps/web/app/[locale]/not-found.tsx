'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Home, MessageSquare, BookOpen } from 'lucide-react';
import s from './not-found.module.css';

export default function NotFound() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      <SiteHeader />
      <main className={s.root}>

        <div className={s.content}>
          <p className={s.code}>404</p>
          <h1 className={s.title}>{t('notFound.title')}</h1>
          <p className={s.description}>{t('notFound.description')}</p>
          <div className={s.actions}>
            <Link href={`/${locale}`} className={s.btnPrimary}>
              <Home size={15} />
              {t('notFound.goHome')}
            </Link>
            <a href="https://docs.kblabs.ru" className={s.btnGhost}>
              <BookOpen size={15} />
              Docs
            </a>
            <Link href={`/${locale}/contact`} className={s.btnGhost}>
              <MessageSquare size={15} />
              {t('notFound.contact')}
            </Link>
          </div>
        </div>

        <p className={s.hint} aria-hidden>
          status: 404 · everything else is fine · probably
        </p>

      </main>
      <SiteFooter />
    </>
  );
}
