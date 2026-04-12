import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import s from './page.module.css';
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
    title: t('solutionReleaseAutomation.meta.title'),
    description: t('solutionReleaseAutomation.meta.description'),
    path: '/solutions/release-automation',
  });
}

type PipelineStage = { label: string; status: string };
type ComparisonItem = { text: string };
type Stat = { value: string; label: string };
type FeatureCard = { title: string; description: string };

/* SVG icons for the 4 feature cards — each visually distinct */
const FEATURE_ICONS = [
  /* 1: Build / layers */
  <svg key="i1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" />
    <path d="M3 6l7 4 7-4" />
    <path d="M10 10v8" />
  </svg>,
  /* 2: Shield / security */
  <svg key="i2" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L3 5v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V5l-7-3z" />
    <polyline points="7 10 9.5 12.5 13 8" />
  </svg>,
  /* 3: Refresh / automation */
  <svg key="i3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4a7 7 0 0 0-10 0" />
    <path d="M5 16a7 7 0 0 0 10 0" />
    <polyline points="15 1 15 4 12 4" />
    <polyline points="5 19 5 16 8 16" />
  </svg>,
  /* 4: Chart / tracing */
  <svg key="i4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 15 7 9 11 12 17 5" />
    <polyline points="14 5 17 5 17 8" />
  </svg>,
];

export default async function CicdPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const pipelineStages = t.raw('solutionReleaseAutomation.pipelineStages') as PipelineStage[];
  const painPoints = t.raw('solutionReleaseAutomation.painPoints') as ComparisonItem[];
  const benefits = t.raw('solutionReleaseAutomation.benefits') as ComparisonItem[];
  const stats = t.raw('solutionReleaseAutomation.stats') as Stat[];
  const features = t.raw('solutionReleaseAutomation.features') as FeatureCard[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <h1>{t('solutionReleaseAutomation.hero.title')}</h1>
          <p>{t('solutionReleaseAutomation.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionReleaseAutomation.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionReleaseAutomation.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* ── Pipeline visualization ── */}
        <section className={s.pipelineSection}>
          <div className={s.pipelineTrack}>
            {pipelineStages.map((stage, i) => (
              <div key={stage.label + i} className={s.pipelineStage}>
                <div className={s.stagePill}>
                  <span className={s.stageDot} />
                  {stage.label}
                </div>
                {i < pipelineStages.length - 1 && <div className={s.stageConnector} />}
              </div>
            ))}
          </div>
        </section>

        {/* ── Before/After comparison ── */}
        <section className={s.comparisonSection}>
          <div className={s.comparisonHeader}>
            <h2>{t('solutionReleaseAutomation.comparisonTitle')}</h2>
            <p>{t('solutionReleaseAutomation.comparisonSubtitle')}</p>
          </div>
          <div className={s.comparisonGrid}>
            <div className={`${s.comparisonCard} ${s.cardBefore}`}>
              <div className={s.cardLabel}>
                <span className={s.labelDot} />
                {t('solutionReleaseAutomation.beforeLabel')}
              </div>
              <h3>{t('solutionReleaseAutomation.beforeTitle')}</h3>
              <ul className={s.comparisonList}>
                {painPoints.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            </div>
            <div className={`${s.comparisonCard} ${s.cardAfter}`}>
              <div className={s.cardLabel}>
                <span className={s.labelDot} />
                {t('solutionReleaseAutomation.afterLabel')}
              </div>
              <h3>{t('solutionReleaseAutomation.afterTitle')}</h3>
              <ul className={s.comparisonList}>
                {benefits.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Stats section ── */}
        <section className={s.statsSection}>
          {stats.map((stat) => (
            <div key={stat.label} className={s.statCard}>
              <span className={s.statBigNumber}>{stat.value}</span>
              <span className={s.statBigLabel}>{stat.label}</span>
            </div>
          ))}
        </section>

        {/* ── Feature cards 2x2 ── */}
        <section className={s.featureSection}>
          <div className={s.featureHeader}>
            <h2>{t('solutionReleaseAutomation.featuresTitle')}</h2>
            <p>{t('solutionReleaseAutomation.featuresSubtitle')}</p>
          </div>
          <div className={s.featureGrid}>
            {features.map((feat, i) => (
              <div key={feat.title} className={s.featureCard}>
                <div className={s.featureIcon}>
                  {FEATURE_ICONS[i] ?? FEATURE_ICONS[0]}
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionReleaseAutomation.cta.title')}</h2>
          <p>{t('solutionReleaseAutomation.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionReleaseAutomation.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionReleaseAutomation.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
