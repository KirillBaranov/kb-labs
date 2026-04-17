'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSENT_EVENT,
  isConsentGiven,
  track,
  trackInstallClick,
  trackInstallCopy,
  trackOutbound,
  trackPageView,
  type Tags,
} from '@/lib/analytics';

export interface Analytics {
  track: (event: string, tags?: Tags) => void;
  trackPageView: (path: string, locale: string) => void;
  trackInstallCopy: (command: string) => void;
  trackInstallClick: (href: string) => void;
  trackOutbound: (href: string, label?: string) => void;
}

/**
 * Returns stable analytics functions bound to the current consent state.
 * All functions are no-ops before consent is given; they activate immediately
 * when CookieBanner dispatches the `kb:consent` event.
 */
export function useAnalytics(): Analytics {
  const [consented, setConsented] = useState(false);
  const consentedRef = useRef(false);

  useEffect(() => {
    const current = isConsentGiven();
    setConsented(current);
    consentedRef.current = current;

    function onConsent() {
      const next = isConsentGiven();
      setConsented(next);
      consentedRef.current = next;
    }

    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  const stableTrack = useCallback(
    (event: string, tags?: Tags) => { if (consentedRef.current) track(event, tags); },
    [],
  );

  const stablePageView = useCallback(
    (path: string, locale: string) => { if (consentedRef.current) trackPageView(path, locale); },
    [],
  );

  const stableInstallCopy = useCallback(
    (command: string) => { if (consentedRef.current) trackInstallCopy(command); },
    [],
  );

  const stableInstallClick = useCallback(
    (href: string) => { if (consentedRef.current) trackInstallClick(href); },
    [],
  );

  const stableOutbound = useCallback(
    (href: string, label?: string) => { if (consentedRef.current) trackOutbound(href, label); },
    [],
  );

  // suppress unused warning — consented drives ref updates
  void consented;

  return {
    track: stableTrack,
    trackPageView: stablePageView,
    trackInstallCopy: stableInstallCopy,
    trackInstallClick: stableInstallClick,
    trackOutbound: stableOutbound,
  };
}
