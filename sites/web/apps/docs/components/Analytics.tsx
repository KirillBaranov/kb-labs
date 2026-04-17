'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { flushAnalytics, trackPageView, trackOutbound } from '@/lib/analytics';

export function Analytics() {
  const pathname = usePathname();
  const trackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (trackedPathRef.current === pathname) return;
    trackedPathRef.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest('a') as HTMLAnchorElement | null;
      if (anchor && anchor.hostname && anchor.hostname !== window.location.hostname) {
        const label = anchor.textContent?.trim().slice(0, 80) || undefined;
        trackOutbound(anchor.href, label);
      }
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') void flushAnalytics();
    }
    function onUnload() {
      void flushAnalytics();
    }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return null;
}
