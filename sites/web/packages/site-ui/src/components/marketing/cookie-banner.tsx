'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export interface CookieBannerProps {
  privacyHref?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  className?: string;
}

export function CookieBanner({ privacyHref = '/legal/privacy', onAccept, onDecline, className }: CookieBannerProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!localStorage.getItem('cookie-consent')) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem('cookie-consent', 'accepted');
    setVisible(false);
    onAccept?.();
  }

  function decline() {
    localStorage.setItem('cookie-consent', 'declined');
    setVisible(false);
    onDecline?.();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className={cn(
        'fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl',
        'flex flex-col gap-3 rounded-xl border border-line-strong bg-surface px-5 py-4 shadow-card-lg',
        'sm:flex-row sm:items-center sm:gap-4',
        className
      )}
    >
      <p className="m-0 flex-1 text-sm leading-relaxed text-muted">
        We use essential and analytics cookies to improve your experience.{' '}
        <Link href={privacyHref} className="text-kb-text underline underline-offset-2 hover:text-accent transition-colors">
          Privacy policy
        </Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={decline}>Decline</Button>
        <Button variant="primary" size="sm" onClick={accept}>Accept all</Button>
      </div>
    </div>
  );
}
