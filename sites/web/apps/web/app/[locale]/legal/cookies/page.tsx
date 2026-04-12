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
    type: 'Essential',
    duration: 'Session',
    purpose: 'Authenticates your session after login. Required for the platform to function.',
  },
  {
    name: 'kb_csrf',
    type: 'Essential',
    duration: 'Session',
    purpose: 'CSRF protection token. Prevents cross-site request forgery attacks.',
  },
  {
    name: 'kb_prefs',
    type: 'Functional',
    duration: '1 year',
    purpose: 'Stores UI preferences such as sidebar state and theme selection.',
  },
  {
    name: '_analytics',
    type: 'Analytics',
    duration: '90 days',
    purpose: 'Aggregated, anonymised usage analytics. Used to understand which features are used most.',
  },
];

export default async function CookiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout title="Cookie Policy" updated="January 2026" currentHref="/legal/cookies">

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
          <p>We use three categories of cookies:</p>
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
              <strong>Analytics</strong> — aggregated, anonymised usage data to help us improve
              the product. No personal data is included. Can be opted out below.
            </li>
          </ul>

          <h2>Cookie details</h2>
          <p>Specific cookies in use:</p>
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
