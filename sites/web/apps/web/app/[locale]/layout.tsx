import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
// Shared keys serialised into __NEXT_DATA__ for client components (nav, footer, ui, notFound).
// request.ts already limits getMessages() to _shared + page chunk — we further restrict
// what the client receives to only the keys needed by layout-level components.
const CLIENT_SHARED_KEYS = ['nav', 'footer', 'ui', 'notFound'] as const;
import { Analytics } from '@/components/Analytics';
import { ThemeApplicator } from '@/components/ThemeApplicator';
import { DeferredCookieBanner } from '@/components/DeferredCookieBanner';
import { routing } from '@/i18n/routing';
import '../globals.css';
import '@kb-labs/web-site-ui/tokens.css';

const headingFont = localFont({
  src: [
    { path: '../fonts/plus-jakarta-sans-latin.woff2', weight: '200 800', style: 'normal' },
    { path: '../fonts/plus-jakarta-sans-cyrillic-ext.woff2', weight: '200 800', style: 'normal' },
  ],
  variable: '--font-heading',
  display: 'swap',
});

const bodyFont = localFont({
  src: [
    { path: '../fonts/inter-latin.woff2', weight: '100 900', style: 'normal' },
    { path: '../fonts/inter-cyrillic.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

const SITE_URL = 'https://kblabs.ru';
const SITE_NAME = 'KB Labs';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
    description: t('meta.siteDescription'),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
      description: t('meta.siteDescription'),
      url: `${SITE_URL}/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
      description: t('meta.siteDescription'),
    },
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: { ru: `${SITE_URL}/ru`, en: `${SITE_URL}/en`, 'x-default': `${SITE_URL}/en` },
    },
  };
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KB Labs',
  url: 'https://kblabs.ru',
  logo: 'https://kblabs.ru/og-image.png',
  foundingDate: '2024',
  founder: { '@type': 'Person', name: 'Kirill Baranov', url: 'https://k-baranov.ru' },
  sameAs: ['https://github.com/KirillBaranov/kb-labs', 'https://www.npmjs.com/org/kb-labs'],
  description: 'Open-source self-hosted platform for engineering teams: workflow engine, AI infrastructure, plugin system, and developer tooling.',
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const allMessages = await getMessages();
  // Only pass shared keys to the client — page-specific translations are RSC-only.
  const clientMessages = Object.fromEntries(
    CLIENT_SHARED_KEYS.filter((k) => allMessages[k] !== undefined).map((k) => [k, allMessages[k]]),
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('kb-theme');var s=t||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');if(s==='dark')document.documentElement.classList.add('dark')}catch(e){}})()` }} />
      </head>
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <NextIntlClientProvider messages={clientMessages}>
          <ThemeApplicator />
          {children}
          <Analytics locale={locale} />
          <DeferredCookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
