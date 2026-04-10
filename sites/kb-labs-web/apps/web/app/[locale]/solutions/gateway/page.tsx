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
    title: t('solutionAiGateway.meta.title'),
    description: t('solutionAiGateway.meta.description'),
    path: '/solutions/gateway',
  });
}

type ValueProp = { title: string; description: string };
type Step = { num: string; title: string; description: string };

const VALUE_ICONS = [
  /* 1: Switch / abstraction */
  <svg key="i1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h12M4 13h12" /><circle cx="8" cy="7" r="2" /><circle cx="12" cy="13" r="2" />
  </svg>,
  /* 2: Layers / tiers */
  <svg key="i2" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L3 6l7 4 7-4-7-4z" /><path d="M3 10l7 4 7-4" /><path d="M3 14l7 4 7-4" />
  </svg>,
  /* 3: Shield / resilience */
  <svg key="i3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L3 5v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V5l-7-3z" /><polyline points="7 10 9.5 12.5 13 8" />
  </svg>,
  /* 4: Gauge / cost */
  <svg key="i4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="12" r="7" /><path d="M10 12l3-5" /><path d="M7 5h6" />
  </svg>,
  /* 5: Lock / self-hosted */
  <svg key="i5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="9" width="12" height="8" rx="1.5" /><path d="M7 9V6a3 3 0 016 0v3" />
  </svg>,
  /* 6: Plug / compatible */
  <svg key="i6" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 01-10 0V7z" /><path d="M10 15v3" />
  </svg>,
];

export default async function AiGatewayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const valueProps = t.raw('solutionAiGateway.valueProps.items') as ValueProp[];
  const steps = t.raw('solutionAiGateway.howItWorks.steps') as Step[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.badge}>Infrastructure Layer</span>
          <h1>{t('solutionAiGateway.hero.title')}</h1>
          <p>{t('solutionAiGateway.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('solutionAiGateway.hero.startBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('solutionAiGateway.hero.contactBtn')}
            </Link>
          </div>
        </section>

        {/* ── Value propositions ── */}
        <section className={s.valueSection}>
          <div className={s.container}>
            <h2>{t('solutionAiGateway.valueProps.title')}</h2>
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

        {/* ── How it works ── */}
        <section className={s.howSection}>
          <div className={s.container}>
            <h2>{t('solutionAiGateway.howItWorks.title')}</h2>
            <div className={s.stepsRow}>
              {steps.map((step, i) => (
                <div key={step.num} className={s.stepCard}>
                  <span className={s.stepNum}>{step.num}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  {i < steps.length - 1 && <span className={s.stepArrow}>→</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Code example ── */}
        <section className={s.codeSection}>
          <div className={s.container}>
            <div className={s.codeBlock}>
              <div className={s.codeDots}><span /><span /><span /></div>
              <pre>
                <code>
                  <span className="gw-c-comment">{`// .kb/kb.config.json — change the adapter, code stays the same`}</span>
                  {`\n{\n  `}
                  <span className="gw-c-string">{`"platform"`}</span>
                  {`: {\n    `}
                  <span className="gw-c-string">{`"adapters"`}</span>
                  {`: {\n      `}
                  <span className="gw-c-string">{`"cache"`}</span>
                  {`:      `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-redis"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"db"`}</span>
                  {`:         `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-sqlite"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"documentDb"`}</span>
                  {`: `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-mongodb"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"vectorStore"`}</span>
                  {`:`}
                  <span className="gw-c-string">{`"@kb-labs/adapters-qdrant"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"eventBus"`}</span>
                  {`:   `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-eventbus-cache"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"llm"`}</span>
                  {`:        `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-openai"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"logger"`}</span>
                  {`:     `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-pino"`}</span>
                  {`,\n      `}
                  <span className="gw-c-string">{`"storage"`}</span>
                  {`:    `}
                  <span className="gw-c-string">{`"@kb-labs/adapters-fs"`}</span>
                  {`\n    }\n  }\n}`}
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionAiGateway.cta.title')}</h2>
          <p>{t('solutionAiGateway.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>
              {t('solutionAiGateway.cta.startBtn')}
            </Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>
              {t('solutionAiGateway.cta.contactBtn')}
            </Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
