'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { trackDocFeedback } from '@/lib/analytics';
import s from './DocsFeedback.module.css';

type State = 'idle' | 'yes' | 'no';

export function DocsFeedback() {
  const pathname = usePathname();
  const t = useTranslations('feedback');
  const [state, setState] = useState<State>('idle');

  const vote = useCallback((useful: boolean) => {
    if (state !== 'idle') return;
    setState(useful ? 'yes' : 'no');
    trackDocFeedback(pathname, useful);
  }, [pathname, state]);

  if (state !== 'idle') {
    return (
      <div className={s.root}>
        <span className={s.thanks}>{t('thanks')}</span>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <span className={s.label}>{t('helpful')}</span>
      <div className={s.actions}>
        <button className={s.btn} onClick={() => vote(true)} aria-label={t('yes')}>
          <ThumbsUp size={14} aria-hidden="true" />
          {t('yes')}
        </button>
        <button className={s.btn} onClick={() => vote(false)} aria-label={t('no')}>
          <ThumbsDown size={14} aria-hidden="true" />
          {t('no')}
        </button>
      </div>
    </div>
  );
}
