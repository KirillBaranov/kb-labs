'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { flushAnalytics, isConsentGiven, trackOutbound, trackPageView, CONSENT_EVENT } from '@/lib/analytics';

interface Props {
  locale: string;
}

/**
 * Root analytics component. Mount once in the locale layout.
 *
 * Responsibilities:
 *   • Page views — initial + every client-side navigation via usePathname
 *   • Outbound link clicks — delegated on document (no per-link changes needed)
 *   • Flush on page unload (visibilitychange + beforeunload)
 *   • Activates page view tracking immediately when user accepts consent
 */
export function Analytics({ locale }: Props) {
  const pathname = usePathname();
  const trackedPathRef = useRef<string | null>(null);

  // Track page view on mount and on every SPA navigation.
  useEffect(() => {
    if (!isConsentGiven()) return;
    if (trackedPathRef.current === pathname) return;
    trackedPathRef.current = pathname;
    trackPageView(pathname, locale);
  }, [pathname, locale]);

  // When user accepts consent mid-session, fire the page view they missed.
  useEffect(() => {
    function onConsent() {
      if (!isConsentGiven()) return;
      trackedPathRef.current = pathname;
      trackPageView(pathname, locale);
    }
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [pathname, locale]);

  // Click delegation — handles data-analytics attributes and outbound links.
  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      const el = e.target as Element;

      // data-analytics="event_name" on any element → track that event
      const tracked = el.closest('[data-analytics]');
      if (tracked) {
        const eventName = tracked.getAttribute('data-analytics');
        if (eventName) {
          import('@/lib/analytics').then(({ track, utmTags }) => {
            track(`${eventName}_click`, { ...utmTags() });
          });
        }
      }

      // Outbound links — any <a> pointing to a different host
      const anchor = el.closest('a') as HTMLAnchorElement | null;
      if (anchor && anchor.hostname && anchor.hostname !== window.location.hostname) {
        const label = anchor.textContent?.trim().slice(0, 80) || undefined;
        trackOutbound(anchor.href, label);
      }
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  // Flush buffered events before the page unloads.
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
