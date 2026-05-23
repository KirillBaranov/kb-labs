'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AnnouncementBarProps {
  message: string;
  href?: string;
  linkLabel?: string;
  dismissible?: boolean;
  storageKey?: string;
  className?: string;
}

export function AnnouncementBar({
  message,
  href,
  linkLabel = 'Learn more',
  dismissible = true,
  storageKey = 'announcement-dismissed',
  className,
}: AnnouncementBarProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!dismissible || !sessionStorage.getItem(storageKey)) setVisible(true);
  }, [dismissible, storageKey]);

  function dismiss() {
    sessionStorage.setItem(storageKey, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center gap-2 bg-kb-text px-4 py-2.5 text-center',
        className
      )}
    >
      <p className="m-0 text-[0.82rem] font-medium leading-snug text-surface/90">
        {message}
        {href && (
          <Link
            href={href}
            className="ml-2 inline-flex items-center gap-0.5 font-semibold text-surface underline-offset-2 hover:underline"
          >
            {linkLabel}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </p>
      {dismissible && (
        <button
          onClick={dismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-md border-0 bg-transparent p-1 text-surface/60 transition-colors hover:text-surface"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
