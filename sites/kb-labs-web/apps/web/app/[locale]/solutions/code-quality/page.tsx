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
    title: t('solutionCodeQuality.meta.title'),
    description: t('solutionCodeQuality.meta.description'),
    path: '/solutions/code-quality',
  });
}

type ToolCard = { title: string; description: string; poweredBy: string };

const TOOL_ICONS = [
  /* QA Plugin — checklist */
  <svg key="qa" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  /* AI Review — sparkle */
  <svg key="review" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>,
  /* Baseline — chart */
  <svg key="baseline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
];

const PIPELINE_STAGES = ['Code', 'Lint', 'Types', 'Tests', 'AI Review', 'Ship'];

export default async function CodeQualityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const toolCards = t.raw('solutionCodeQuality.tools') as ToolCard[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* -- 1. Hero -- */}
        <section className={s.hero}>
          <span className={s.heroBadge}>{t('solutionCodeQuality.hero.badge')}</span>
          <h1>{t('solutionCodeQuality.hero.title')}</h1>
          <p>{t('solutionCodeQuality.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionCodeQuality.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionCodeQuality.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* -- 2. Quality Pipeline -- */}
        <section className={s.pipelineSection}>
          <h2>{t('solutionCodeQuality.pipeline.title')}</h2>
          <div className={s.pipelineTrack}>
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage} className={s.pipelineStage}>
                <div className={s.stagePill}>
                  <span className={s.stageCheck}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 6.5 11.5 13 5" /></svg>
                  </span>
                  {stage}
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={s.stageArrow}>
                    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                      <path d="M0 6h16M13 2l4 4-4 4" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* -- 3. Before/After Metrics (Terminal Blocks) -- */}
        <section className={s.metricsSection}>
          <div className={s.metricsHeader}>
            <h2>{t('solutionCodeQuality.metrics.title')}</h2>
            <p>{t('solutionCodeQuality.metrics.subtitle')}</p>
          </div>
          <div className={s.metricsGrid}>
            {/* Before */}
            <div className={s.terminalBlock}>
              <div className={s.terminalBar}>
                <span className={s.termDot} />
                <span className={s.termDot} />
                <span className={s.termDot} />
                <span className={s.termTitle}>{t('solutionCodeQuality.metrics.beforeLabel')}</span>
              </div>
              <div className={s.terminalBody}>
                <div className={s.termLine}><span className={s.termMuted}>$</span> npx kb-devkit-qa</div>
                <div className={s.termLine}>&nbsp;</div>
                <div className={s.termLine}><span className={s.termRed}>47</span> test failures</div>
                <div className={s.termLine}><span className={s.termRed}>870</span> lint errors</div>
                <div className={s.termLine}><span className={s.termRed}>2,408</span> type errors</div>
                <div className={s.termLine}><span className={s.termMuted}>No baseline. No trend tracking.</span></div>
                <div className={s.termLine}><span className={s.termMuted}>Regressions discovered in production.</span></div>
                <div className={s.termLine}>&nbsp;</div>
                <div className={s.termLine}><span className={s.termRed}>FAILED</span> — quality unknown</div>
              </div>
            </div>
            {/* After */}
            <div className={s.terminalBlock}>
              <div className={s.terminalBar}>
                <span className={s.termDot} />
                <span className={s.termDot} />
                <span className={s.termDot} />
                <span className={s.termTitle}>{t('solutionCodeQuality.metrics.afterLabel')}</span>
              </div>
              <div className={s.terminalBody}>
                <div className={s.termLine}><span className={s.termMuted}>$</span> pnpm qa:regressions</div>
                <div className={s.termLine}>&nbsp;</div>
                <div className={s.termLine}><span className={s.termGreen}>0</span> new regressions</div>
                <div className={s.termLine}><span className={s.termGreen}>100%</span> build pass rate</div>
                <div className={s.termLine}><span className={s.termGreen}>Baseline enforced</span> — errors ratcheted down</div>
                <div className={s.termLine}><span className={s.termGreen}>Trend tracking</span> — quality improves over time</div>
                <div className={s.termLine}><span className={s.termGreen}>AI Review</span> — every PR analyzed</div>
                <div className={s.termLine}>&nbsp;</div>
                <div className={s.termLine}><span className={s.termGreen}>PASSED</span> — ship with confidence</div>
              </div>
            </div>
          </div>
        </section>

        {/* -- 4. Tool Cards (3-column) -- */}
        <section className={s.toolsSection}>
          <div className={s.toolsHeader}>
            <h2>{t('solutionCodeQuality.toolsSection.title')}</h2>
            <p>{t('solutionCodeQuality.toolsSection.subtitle')}</p>
          </div>
          <div className={s.toolsGrid}>
            {toolCards.map((tool, i) => (
              <div key={tool.title} className={s.toolCard}>
                <div className={s.toolIcon}>{TOOL_ICONS[i] ?? TOOL_ICONS[0]}</div>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <span className={s.poweredBy}>{tool.poweredBy}</span>
              </div>
            ))}
          </div>
        </section>

        {/* -- 5. Stats Bar -- */}
        <section className={s.statsBar}>
          <div className={s.statItem}>
            <span className={s.statValue}>2,408</span>
            <span className={s.statLabel}>{t('solutionCodeQuality.stats.typeErrors')}</span>
          </div>
          <div className={s.statDivider} />
          <div className={s.statItem}>
            <span className={s.statValue}>870</span>
            <span className={s.statLabel}>{t('solutionCodeQuality.stats.lintErrors')}</span>
          </div>
          <div className={s.statDivider} />
          <div className={s.statItem}>
            <span className={s.statValue}>100%</span>
            <span className={s.statLabel}>{t('solutionCodeQuality.stats.regressionDetection')}</span>
          </div>
        </section>

        {/* -- 6. CTA -- */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionCodeQuality.cta.title')}</h2>
          <p>{t('solutionCodeQuality.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionCodeQuality.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionCodeQuality.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
