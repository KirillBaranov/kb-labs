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
    title: t('productStateBroker.meta.title'),
    description: t('productStateBroker.meta.description'),
    path: '/product/state-broker',
  });
}

type ComparisonRow = {
  feature: string;
  traditional: string;
  stateBroker: string;
};

type ScalingTier = {
  badge: string;
  title: string;
  latency: string;
  description: string;
};

export default async function StateBrokerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const comparisonRows = t.raw('productStateBroker.comparisonRows') as ComparisonRow[];
  const scalingTiers = t.raw('productStateBroker.scalingTiers') as ScalingTier[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <h1>{t('productStateBroker.hero.title')}</h1>
          <p>{t('productStateBroker.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('productStateBroker.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productStateBroker.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* ── Architecture diagram ── */}
        <section className={s.architectureSection}>
          <h2>{t('productStateBroker.architectureTitle')}</h2>
          <div className={s.diagram}>
            <div className={s.diagramArrowRow}>
              <div className={s.diagramBox}>{t('productStateBroker.archWorkflow')}</div>
              <div className={s.arrowLine} />
              <div className={`${s.diagramBox} ${s.diagramBoxCenter}`}>{t('productStateBroker.archBroker')}</div>
              <div className={`${s.arrowLine} ${s.arrowLineReverse}`} />
              <div className={s.diagramBox}>{t('productStateBroker.archPlugin')}</div>
            </div>
            <div className={s.verticalConnector}>
              <div className={s.verticalLine} />
              <div className={`${s.diagramBox} ${s.diagramBoxDashed}`}>{t('productStateBroker.archRedis')}</div>
            </div>
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section className={s.comparisonSection}>
          <h2>{t('productStateBroker.comparisonTitle')}</h2>
          <table className={s.comparisonTable}>
            <thead>
              <tr>
                <th>{t('productStateBroker.comparisonHeaders.feature')}</th>
                <th>{t('productStateBroker.comparisonHeaders.traditional')}</th>
                <th>{t('productStateBroker.comparisonHeaders.stateBroker')}</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <td className={s.colFeature}>{row.feature}</td>
                  <td className={s.colTraditional}>{row.traditional}</td>
                  <td className={s.colBroker}>{row.stateBroker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Code API examples ── */}
        <section className={s.codeExamplesSection}>
          {/* Cache API */}
          <div className={s.codePanel}>
            <div className={s.codePanelHeader}>
              <span className={s.codePanelDot} />
              <span className={s.codePanelDot} />
              <span className={s.codePanelDot} />
              <span className={s.codePanelLabel}>{t('productStateBroker.codeExamples.cacheLabel')}</span>
            </div>
            <pre><code>{`\
`}<span className={s.tsKeyword}>import</span>{` { `}<span className={s.tsType}>useCache</span>{` } `}<span className={s.tsKeyword}>from</span>{` `}<span className={s.tsString}>{`'@kb-labs/sdk'`}</span>{`;

`}<span className={s.tsKeyword}>const</span>{` cache = `}<span className={s.tsType}>useCache</span>{`();

`}<span className={s.tsComment}>{'// Store with TTL'}</span>{`
`}<span className={s.tsKeyword}>await</span>{` cache.`}<span className={s.tsProp}>set</span>{`(`}<span className={s.tsString}>{`'user:123'`}</span>{`, data, `}<span className={s.tsNumber}>60_000</span>{`);

`}<span className={s.tsComment}>{'// Retrieve'}</span>{`
`}<span className={s.tsKeyword}>const</span>{` user = `}<span className={s.tsKeyword}>await</span>{` cache.`}<span className={s.tsProp}>get</span>{`(`}<span className={s.tsString}>{`'user:123'`}</span>{`);`}</code></pre>
          </div>

          {/* Pub/Sub */}
          <div className={s.codePanel}>
            <div className={s.codePanelHeader}>
              <span className={s.codePanelDot} />
              <span className={s.codePanelDot} />
              <span className={s.codePanelDot} />
              <span className={s.codePanelLabel}>{t('productStateBroker.codeExamples.pubsubLabel')}</span>
            </div>
            <pre><code>{`\
`}<span className={s.tsKeyword}>import</span>{` { `}<span className={s.tsType}>useBroker</span>{` } `}<span className={s.tsKeyword}>from</span>{` `}<span className={s.tsString}>{`'@kb-labs/sdk'`}</span>{`;

`}<span className={s.tsKeyword}>const</span>{` broker = `}<span className={s.tsType}>useBroker</span>{`();

`}<span className={s.tsComment}>{'// Subscribe to changes'}</span>{`
broker.`}<span className={s.tsProp}>subscribe</span>{`(`}<span className={s.tsString}>{`'deploy:*'`}</span>{`, (event) => {
  console.`}<span className={s.tsProp}>log</span>{`(event.`}<span className={s.tsProp}>key</span>{`, event.`}<span className={s.tsProp}>value</span>{`);
});

`}<span className={s.tsComment}>{'// Publish'}</span>{`
broker.`}<span className={s.tsProp}>publish</span>{`(`}<span className={s.tsString}>{`'deploy:started'`}</span>{`, { `}<span className={s.tsProp}>env</span>{`: `}<span className={s.tsString}>{`'prod'`}</span>{` });`}</code></pre>
          </div>
        </section>

        {/* ── Scaling tiers ── */}
        <section className={s.scalingSection}>
          <h2>{t('productStateBroker.scalingTitle')}</h2>
          <div className={s.scalingGrid}>
            {scalingTiers.map((tier) => (
              <div key={tier.badge} className={s.scalingCard}>
                <span className={s.scalingBadge}>{tier.badge}</span>
                <h3>{tier.title}</h3>
                <span className={s.scalingLatency}>{tier.latency}</span>
                <p>{tier.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('productStateBroker.cta.title')}</h2>
          <p>{t('productStateBroker.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('productStateBroker.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productStateBroker.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
