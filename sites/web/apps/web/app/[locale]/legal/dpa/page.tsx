import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import { LegalLayout } from '../LegalLayout';
import ContentEn from './content.en.mdx';
import ContentRu from './content.ru.mdx';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('legal.dpa.meta.title'),
    description: t('legal.dpa.meta.description'),
    path: '/legal/dpa',
    imageSegment: 'default',
  });
}

export default async function DpaPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const Content = locale === 'ru' ? ContentRu : ContentEn;

  const navItems = [
    { label: t('legal.privacy.meta.title'), href: `/${locale}/legal/privacy` },
    { label: t('legal.terms.meta.title'), href: `/${locale}/legal/terms` },
    { label: t('legal.dpa.meta.title'), href: `/${locale}/legal/dpa` },
    { label: t('legal.cookies.meta.title'), href: `/${locale}/legal/cookies` },
  ];

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout
          title={t('legal.dpa.meta.title')}
          updated={t('legal.dpa.updated')}
          lastUpdatedLabel={t('legal.lastUpdated')}
          navTitle={t('legal.navTitle')}
          navItems={navItems}
          currentHref={`/${locale}/legal/dpa`}
        >
          <Content />
        </LegalLayout>
      </main>
      <SiteFooter />
    </>
  );
}
