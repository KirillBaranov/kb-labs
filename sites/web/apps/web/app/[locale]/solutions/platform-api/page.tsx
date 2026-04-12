import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { PlatformApiContent } from './PlatformApiContent';
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
    title: t('solutionPlatformApi.meta.title'),
    description: t('solutionPlatformApi.meta.description'),
    path: '/solutions/platform-api',
  });
}

export default async function PlatformApiPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <>
      <SiteHeader />
      <main>
        <PlatformApiContent
          locale={locale}
          t={{
            heroTitle: t('solutionPlatformApi.hero.title'),
            heroDescription: t('solutionPlatformApi.hero.description'),
            startBtn: t('solutionPlatformApi.hero.startBtn'),
            contactBtn: t('solutionPlatformApi.hero.contactBtn'),
            configCaption: t('solutionPlatformApi.configCaption'),
            archTitle: t('solutionPlatformApi.architecture.title'),
            adapterTitle: t('solutionPlatformApi.adapters.title'),
            ctaTitle: t('solutionPlatformApi.cta.title'),
            ctaDescription: t('solutionPlatformApi.cta.description'),
            ctaStartBtn: t('solutionPlatformApi.cta.startBtn'),
            ctaContactBtn: t('solutionPlatformApi.cta.contactBtn'),
          }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
