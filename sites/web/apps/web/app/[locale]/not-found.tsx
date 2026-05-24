'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function NotFound() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-6 px-4 text-center">
          <p className="font-mono text-7xl font-bold text-muted/20">404</p>
          <p className="max-w-sm text-base text-muted/70">{t('notFound.description')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}`}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('notFound.goHome')}
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-kb-text transition-colors hover:bg-surface"
            >
              {t('notFound.contact')}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
