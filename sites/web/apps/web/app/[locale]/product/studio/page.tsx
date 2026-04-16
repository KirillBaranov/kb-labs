import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from './page.module.css';

type Props = { params: Promise<{ locale: string }> };

type Step = { step: string; title: string; description: string };
type Feature = { title: string; description: string };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('productStudio.meta.title'),
    description: t('productStudio.meta.description'),
    path: '/product/studio',
  });
}

export default async function StudioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const steps = t.raw('productStudio.how.steps') as Step[];
  const features = t.raw('productStudio.sdk.features') as Feature[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <div className={s.heroInner}>
            <span className={s.eyebrow}>{t('productStudio.hero.eyebrow')}</span>
            <h1 className={s.heroTitle}>{t('productStudio.hero.title')}</h1>
            <p className={s.heroDesc}>{t('productStudio.hero.description')}</p>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className={s.howSection}>
          <div className={s.howInner}>
            <h2 className={s.sectionTitle}>{t('productStudio.how.title')}</h2>
            <div className={s.stepsGrid}>
              {steps.map((step) => (
                <div key={step.step} className={s.step}>
                  <div className={s.stepNum}>{step.step}</div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SDK surface ── */}
        <section className={s.sdkSection}>
          <div className={s.sdkInner}>
            <div className={s.sdkHeader}>
              <h2>{t('productStudio.sdk.title')}</h2>
              <p>{t('productStudio.sdk.description')}</p>
            </div>
            <div className={s.featuresGrid}>
              {features.map((feature) => (
                <div key={feature.title} className={s.featureCard}>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('productStudio.cta.title')}</h2>
          <p>{t('productStudio.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('productStudio.cta.installBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('productStudio.cta.contactBtn')}
            </Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
