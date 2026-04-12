import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { CookieBanner } from '@/components/CookieBanner';
import { ScrollReveal } from '@/components/ScrollReveal';
import { routing } from '@/i18n/routing';
import '../globals.css';

const headingFont = Plus_Jakarta_Sans({
  subsets: ['latin', 'cyrillic-ext'],
  variable: '--font-heading',
  display: 'swap',
});

const bodyFont = Inter({
  subsets: ['latin', 'cyrillic'],
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
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <NextIntlClientProvider messages={messages}>
          {children}
          <CookieBanner />
          <ScrollReveal />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
