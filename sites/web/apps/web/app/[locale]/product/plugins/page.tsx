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
    title: t('productPlugins.meta.title'),
    description: t('productPlugins.meta.description'),
    path: '/product/plugins',
  });
}

type EcosystemType = {
  name: string;
  count: string;
  description: string;
  color: string;
};

type Capability = {
  num: string;
  title: string;
  description: string;
};

export default async function PluginsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const ecosystemTypes = t.raw('productPlugins.ecosystemTypes') as EcosystemType[];
  const capabilities = t.raw('productPlugins.capabilities') as Capability[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <h1>{t('productPlugins.hero.title')}</h1>
          <p>{t('productPlugins.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('productPlugins.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productPlugins.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* ── Plugin manifest code block ── */}
        <section className={s.manifestSection}>
          <div className={s.manifestBlock}>
            <div className={s.manifestHeader}>
              <span className={s.manifestDot} />
              <span className={s.manifestDot} />
              <span className={s.manifestDot} />
              <span className={s.manifestFileName}>manifest.ts</span>
            </div>
            <pre><code>{`\
`}<span className={s.tsKeyword}>import</span>{` { `}<span className={s.tsType}>combinePermissions</span>{`, `}<span className={s.tsType}>kbPlatformPreset</span>{` } `}<span className={s.tsKeyword}>from</span>{` `}<span className={s.tsString}>{`'@kb-labs/sdk'`}</span>{`;

`}<span className={s.tsKeyword}>export default</span>{` {
  `}<span className={s.tsProp}>schema</span>{`:      `}<span className={s.tsString}>{`'kb.plugin/3'`}</span>{`,
  `}<span className={s.tsProp}>id</span>{`:          `}<span className={s.tsString}>{`'@kb-labs/commit'`}</span>{`,
  `}<span className={s.tsProp}>version</span>{`:     `}<span className={s.tsString}>{`'0.1.0'`}</span>{`,
  `}<span className={s.tsProp}>permissions</span>{`: `}<span className={s.tsType}>combinePermissions</span>{`().`}<span className={s.tsProp}>with</span>{`(`}<span className={s.tsType}>kbPlatformPreset</span>{`).`}<span className={s.tsProp}>build</span>{`(),
  `}<span className={s.tsProp}>cli</span>{`: {
    `}<span className={s.tsProp}>commands</span>{`: [{ `}<span className={s.tsProp}>id</span>{`: `}<span className={s.tsString}>{`'commit'`}</span>{`, `}<span className={s.tsProp}>handler</span>{`: `}<span className={s.tsString}>{`'./commands/run.js#default'`}</span>{` }],
  },
} `}<span className={s.tsKeyword}>as const</span>{`;`}</code></pre>
          </div>
          <p className={s.manifestCaption}>{t('productPlugins.manifestCaption')}</p>
        </section>

        {/* ── Ecosystem section ── */}
        <section className={s.ecosystemSection}>
          <h2>{t('productPlugins.ecosystemTitle')}</h2>
          <div className={s.ecosystemGrid}>
            {ecosystemTypes.map((type) => (
              <div key={type.name} className={s.ecoCard}>
                <div className={s.ecoIcon} style={{ background: type.color }}>
                  {type.name.charAt(0)}
                </div>
                <div className={s.ecoCardHeader}>
                  <h3>{type.name}</h3>
                  <span className={s.ecoCount}>{type.count}</span>
                </div>
                <p>{type.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Two-column feature ── */}
        <section className={s.featureRow}>
          <div className={s.featureContent}>
            <h2>{t('productPlugins.featureStatement')}</h2>
            <p>{t('productPlugins.featureDescription')}</p>
          </div>
          <div className={s.terminalWindow}>
            <div className={s.terminalBar}>
              <span className={`${s.terminalDot} ${s.terminalDotRed}`} />
              <span className={`${s.terminalDot} ${s.terminalDotYellow}`} />
              <span className={`${s.terminalDot} ${s.terminalDotGreen}`} />
            </div>
            <div className={s.terminalBody}>
              <pre><code>{`\
`}<span className={s.termPrompt}>$</span>{` `}<span className={s.termCmd}>kb marketplace install @kb-labs/commit-entry</span>{`

`}<span className={s.termOutput}>Resolving @kb-labs/commit-entry@latest...</span>{`
`}<span className={s.termOutput}>Validating manifest: kb.plugin/3</span>{`
`}<span className={s.termOutput}>Installing 1 package via pnpm...</span>{`

`}<span className={s.termSuccess}>Done.</span>{` `}<span className={s.termOutput}>6 commands registered.</span>{`
`}<span className={s.termOutput}>Run</span>{` `}<span className={s.termCmd}>kb commit --help</span>{` `}<span className={s.termOutput}>to get started.</span></code></pre>
            </div>
          </div>
        </section>

        {/* ── Capability list ── */}
        <section className={s.capabilitySection}>
          {capabilities.map((cap) => (
            <div key={cap.num} className={s.capItem}>
              <div className={s.capLeft}>
                <span className={s.capNum}>{cap.num}</span>
                <span className={s.capTitle}>{cap.title}</span>
              </div>
              <p className={s.capDesc}>{cap.description}</p>
            </div>
          ))}
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('productPlugins.cta.title')}</h2>
          <p>{t('productPlugins.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('productPlugins.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productPlugins.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
