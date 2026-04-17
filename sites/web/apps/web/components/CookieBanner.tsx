'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { CONSENT_EVENT } from '@/lib/analytics';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cookie-consent')) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem('cookie-consent', 'accepted');
    setVisible(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
  }

  function decline() {
    localStorage.setItem('cookie-consent', 'declined');
    setVisible(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
  }

  const locale = useLocale();

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <div className="cookie-inner">
        <div className="cookie-text">
          <span className="cookie-title">We use cookies</span>
          <span className="cookie-desc">
            We use essential cookies to make our site work and analytics cookies to understand how you use it.{' '}
            <Link href={`/${locale}/legal/privacy`} className="cookie-link">Privacy policy</Link>
          </span>
        </div>
        <div className="cookie-actions">
          <button className="cookie-btn-decline" onClick={decline}>
            Decline
          </button>
          <button className="cookie-btn-accept" onClick={accept}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
