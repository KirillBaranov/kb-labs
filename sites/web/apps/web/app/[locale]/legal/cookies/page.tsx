import type { Metadata } from 'next';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { LegalLayout } from '../LegalLayout';
import { buildPageMetadata } from '@/lib/page-metadata';


type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('legal.cookies.meta.title'),
    description: t('legal.cookies.meta.description'),
    path: '/legal/cookies',
  });
}

const COOKIES = [
  {
    name: 'kb_session',
    type: 'Essential cookie',
    duration: 'Session',
    purpose: 'Authenticates your session after login. Required for the platform to function.',
  },
  {
    name: 'kb_csrf',
    type: 'Essential cookie',
    duration: 'Session',
    purpose: 'CSRF protection token. Prevents cross-site request forgery attacks.',
  },
  {
    name: 'kb_prefs',
    type: 'Functional cookie',
    duration: '1 year',
    purpose: 'Stores UI preferences such as sidebar state and theme selection.',
  },
  {
    name: 'cookie-consent',
    type: 'Essential localStorage',
    duration: 'Persistent',
    purpose: 'Stores your cookie consent choice ("accepted" or "declined"). Set when you interact with the consent banner.',
  },
  {
    name: 'kb_analytics',
    type: 'Analytics localStorage',
    duration: 'Persistent',
    purpose: 'Anonymous device credentials (random ID, clientId, clientSecret) used to authenticate telemetry events sent to the KB Labs Gateway. Only written after you accept analytics cookies. Not linked to your identity.',
  },
  {
    name: 'kb_docs_analytics',
    type: 'Analytics localStorage',
    duration: 'Persistent',
    purpose: 'Same as kb_analytics but scoped to docs.kblabs.ru. Written on first visit to the docs site. Contains only an anonymous device ID.',
  },
];

export default async function CookiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout title="Cookie Policy" updated="April 2026" currentHref="/legal/cookies">

          <p>
            This Cookie Policy explains what cookies KB Labs uses, why we use them,
            and how you can control them.
          </p>

          <h2>What are cookies?</h2>
          <p>
            Cookies are small text files stored on your device by your browser when you visit a website.
            They help websites remember your preferences and session state between page loads.
          </p>

          <h2>What we use</h2>
          <p>We use browser cookies and <code>localStorage</code> entries across three categories:</p>
          <ul>
            <li>
              <strong>Essential</strong> — required for the platform to work. Cannot be disabled.
              These include session authentication and CSRF protection.
            </li>
            <li>
              <strong>Functional</strong> — remember your preferences (theme, sidebar state).
              Disabling these means your preferences reset on each visit.
            </li>
            <li>
              <strong>Analytics</strong> — anonymous usage data to help us improve the product.
              No personal data is included. Requires your consent on kblabs.ru (via the cookie banner).
              On docs.kblabs.ru only anonymous page views and explicit feedback are collected without a consent gate.
            </li>
          </ul>

          <h2>Cookie &amp; localStorage details</h2>
          <p>Specific entries in use:</p>
          <ul>
            {COOKIES.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong> ({c.type}, {c.duration}) — {c.purpose}
              </li>
            ))}
          </ul>

          <h2>Third-party cookies</h2>
          <p>
            We do not use third-party advertising cookies or social media tracking pixels.
            Our analytics is self-hosted and does not share data with external analytics providers.
          </p>

          <h2>How to control cookies</h2>
          <p>You can control cookies in two ways:</p>
          <ul>
            <li>
              <strong>Browser settings</strong> — all modern browsers allow you to block or delete cookies.
              Note that blocking essential cookies will prevent you from logging in.
            </li>
            <li>
              <strong>Account settings</strong> — opt out of analytics cookies in your account preferences.
            </li>
          </ul>
          <p>
            For browser-specific instructions, refer to your browser&apos;s help documentation.
          </p>

          <h2>Changes</h2>
          <p>
            We&apos;ll update this page if we add new cookies. Material changes will be notified via email.
          </p>

          <h2>Contact</h2>
          <p>
            Questions? Email <a href="mailto:privacy@kblabs.ru">privacy@kblabs.ru</a>.
          </p>

        </LegalLayout>
      </main>
      <SiteFooter />
    </>
  );
}
