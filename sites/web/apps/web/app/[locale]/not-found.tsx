'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Home, MessageSquare, BookOpen, ArrowRight } from 'lucide-react';
import s from './not-found.module.css';

const LOG = [
  { who: 'router',   text: 'GET /product → looking for page component…' },
  { who: 'router',   text: 'nothing here. weird.' },
  { who: 'kb-bot',   text: 'hey @kirillb — did you delete /product again?' },
  { who: 'kirillb',  text: 'yes. it was legacy. i regret nothing.' },
  { who: 'kb-bot',   text: 'noted 👍  rendering 404 page instead.' },
  { who: 'router',   text: 'sounds good. have a nice day.' },
];

const WHO_STYLE: Record<string, string> = {
  router:  s.whoRouter,
  'kb-bot': s.whoBot,
  kirillb: s.whoUser,
};

export default function NotFound() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      <SiteHeader />
      <main className={s.root}>

        {/* Background 404 */}
        <span className={s.bg404} aria-hidden>404</span>

        {/* Headline + actions — primary */}
        <div className={s.top}>
          <h1 className={s.title}>404</h1>
          <p className={s.headline}>{t('notFound.description')}</p>
          <div className={s.actions}>
            <Link href={`/${locale}`} className={s.btnPrimary}>
              <Home size={15} />
              {t('notFound.goHome')}
            </Link>
            <Link href={`/${locale}/product/workflows`} className={s.btnGhost}>
              <ArrowRight size={15} />
              Workflow Engine
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

        {/* Easter egg — secondary, for the curious */}
        <div className={s.card} aria-hidden>
          <div className={s.statusBar}>
            <span className={s.statusLabel}># kb-internal</span>
            <span className={s.statusTime}>just now</span>
          </div>
          <div className={s.log}>
            {LOG.map((entry, i) => (
              <div key={i} className={s.logRow}>
                <span className={`${s.who} ${WHO_STYLE[entry.who] ?? ''}`}>
                  {entry.who}
                </span>
                <span className={s.msg}>{entry.text}</span>
              </div>
            ))}
          </div>
          <div className={s.meta}>
            <span>status: <b>404</b></span>
            <span>·</span>
            <span>everything else is fine</span>
            <span>·</span>
            <span>probably</span>
          </div>
        </div>

      </main>
      <SiteFooter />
    </>
  );
}
