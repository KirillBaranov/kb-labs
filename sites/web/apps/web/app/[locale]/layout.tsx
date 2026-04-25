import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Analytics } from '@/components/Analytics';
import { CookieBanner } from '@/components/CookieBanner';
import { ScrollReveal } from '@/components/ScrollReveal';
import { routing } from '@/i18n/routing';
import '../globals.css';

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
    title: {
      default: SITE_NAME,
      template: `%s — ${SITE_NAME}`,
    },
    description: t('meta.siteDescription'),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: {
        default: SITE_NAME,
        template: `%s — ${SITE_NAME}`,
      },
      description: t('meta.siteDescription'),
      url: `${SITE_URL}/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: {
        default: SITE_NAME,
        template: `%s — ${SITE_NAME}`,
      },
      description: t('meta.siteDescription'),
    },
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        ru: `${SITE_URL}/ru`,
        en: `${SITE_URL}/en`,
        'x-default': `${SITE_URL}/en`,
      },
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
  founder: {
    '@type': 'Person',
    name: 'Kirill Baranov',
    url: 'https://k-baranov.ru',
  },
  sameAs: [
    'https://github.com/KirillBaranov/kb-labs',
    'https://www.npmjs.com/org/kb-labs',
  ],
  description:
    'Open-source self-hosted platform for engineering teams: workflow engine, AI infrastructure, plugin system, and developer tooling.',
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
          <Analytics locale={locale} />
          <CookieBanner />
          <ScrollReveal />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
