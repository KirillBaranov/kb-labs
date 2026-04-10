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
    title: t('solutionObservability.meta.title'),
    description: t('solutionObservability.meta.description'),
    path: '/solutions/observability',
  });
}

type ValueProp = { title: string; description: string };
type Audience = { role: string; sees: string };

const VALUE_ICONS = [
  /* 1: Funnel / ingestion */
  <svg key="i1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h16l-5 6v5l-2 2V9L2 3z" />
  </svg>,
  /* 2: Brain / LLM tracking */
  <svg key="i2" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7" /><path d="M7 10c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3" /><circle cx="10" cy="10" r="1" />
  </svg>,
  /* 3: Code / SDK */
  <svg key="i3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 7 2 10 6 13" /><polyline points="14 7 18 10 14 13" /><line x1="11" y1="4" x2="9" y2="16" />
  </svg>,
  /* 4: Cloud / external */
  <svg key="i4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16h10a4 4 0 000-8 5 5 0 00-10 2 3 3 0 000 6z" />
  </svg>,
  /* 5: Database / storage */
  <svg key="i5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="10" cy="5" rx="7" ry="3" /><path d="M3 5v10c0 1.66 3.13 3 7 3s7-1.34 7-3V5" /><path d="M3 10c0 1.66 3.13 3 7 3s7-1.34 7-3" />
  </svg>,
  /* 6: Grid / dashboards */
  <svg key="i6" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="7" height="7" rx="1" /><rect x="11" y="2" width="7" height="4" rx="1" /><rect x="2" y="11" width="7" height="4" rx="1" /><rect x="11" y="8" width="7" height="7" rx="1" />
  </svg>,
];

export default async function ObservabilityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const valueProps = t.raw('solutionObservability.valueProps.items') as ValueProp[];
  const audiences = t.raw('solutionObservability.audiences.items') as Audience[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.badge}>Observability</span>
          <h1>{t('solutionObservability.hero.title')}</h1>
          <p>{t('solutionObservability.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('solutionObservability.hero.startBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('solutionObservability.hero.contactBtn')}
            </Link>
          </div>
        </section>

        {/* ── Value propositions ── */}
        <section className={s.valueSection}>
          <div className={s.container}>
            <h2>{t('solutionObservability.valueProps.title')}</h2>
            <div className={s.valueGrid}>
              {valueProps.map((item, i) => (
                <div key={item.title} className={s.valueCard}>
                  <div className={s.valueIcon}>{VALUE_ICONS[i]}</div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Who benefits ── */}
        <section className={s.audienceSection}>
          <div className={s.container}>
            <h2>{t('solutionObservability.audiences.title')}</h2>
            <div className={s.audienceGrid}>
              {audiences.map((a) => (
                <div key={a.role} className={s.audienceCard}>
                  <h3>{a.role}</h3>
                  <p>{a.sees}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SDK example ── */}
        <section className={s.codeSection}>
          <div className={s.container}>
            <div className={s.codeBlock}>
              <div className={s.codeDots}><span /><span /><span /></div>
              <pre><code>{`import { KBTelemetry } from '@kb-labs/telemetry-client';

const telemetry = new KBTelemetry({
  endpoint: 'http://gateway:4000',
  apiKey: process.env.KB_API_KEY,
  source: 'my-product',
});

telemetry.event('user.signup', { plan: 'pro' });
telemetry.metric('api_latency_ms', 142);
telemetry.log('info', 'Payment processed', { amount: 99 });`}</code></pre>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionObservability.cta.title')}</h2>
          <p>{t('solutionObservability.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('solutionObservability.cta.startBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('solutionObservability.cta.contactBtn')}
            </Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
