'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { trackDocFeedback } from '@/lib/analytics';
import s from './DocsFeedback.module.css';

type State = 'idle' | 'yes' | 'no';

export function DocsFeedback() {
  const pathname = usePathname();
  const [state, setState] = useState<State>('idle');

  const vote = useCallback((useful: boolean) => {
    if (state !== 'idle') return;
    setState(useful ? 'yes' : 'no');
    trackDocFeedback(pathname, useful);
  }, [pathname, state]);

  if (state !== 'idle') {
    return (
      <div className={s.root}>
        <span className={s.thanks}>Thanks for the feedback!</span>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <span className={s.label}>Was this page helpful?</span>
      <div className={s.actions}>
        <button className={s.btn} onClick={() => vote(true)} aria-label="Yes, helpful">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.5c.5-1.5 2.5-1.5 3 0 .3.8 0 1.7-.7 2.2L8 7 5.7 4.7C5 4.2 4.7 3.3 5 2.5c.5-1.5 2.5-1.5 3 0z" fill="currentColor"/>
            <path d="M8 7v6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M4.5 10.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Yes
        </button>
        <button className={s.btn} onClick={() => vote(false)} aria-label="No, not helpful">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 13.5c-.5 1.5-2.5 1.5-3 0-.3-.8 0-1.7.7-2.2L8 9l2.3 2.3c.7.5 1 1.4.7 2.2-.5 1.5-2.5 1.5-3 0z" fill="currentColor"/>
            <path d="M8 9V2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M4.5 5.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          No
        </button>
      </div>
    </div>
  );
}
