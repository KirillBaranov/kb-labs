'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
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
          <ThumbsUp size={14} aria-hidden="true" />
          Yes
        </button>
        <button className={s.btn} onClick={() => vote(false)} aria-label="No, not helpful">
          <ThumbsDown size={14} aria-hidden="true" />
          No
        </button>
      </div>
    </div>
  );
}
