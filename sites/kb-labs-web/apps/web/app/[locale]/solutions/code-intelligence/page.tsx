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
    title: t('solutionCodeIntelligence.meta.title'),
    description: t('solutionCodeIntelligence.meta.description'),
    path: '/solutions/code-intelligence',
  });
}

type FeatureItem = { title: string; description: string };
type ModeData = { name: string; speed: string; badge?: string; description: string; useCases: string[] };

const FEATURE_ICONS = [
  /* Hybrid Search */
  <svg key="hybrid" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  /* Anti-Hallucination */
  <svg key="verify" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  /* Agent-Ready */
  <svg key="agent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></svg>,
  /* Incremental Indexing */
  <svg key="index" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>,
];

export default async function MindRagPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const featureItems = t.raw('solutionCodeIntelligence.featureGrid.items') as FeatureItem[];
  const modeInstant = t.raw('solutionCodeIntelligence.modes.instant') as ModeData;
  const modeAuto = t.raw('solutionCodeIntelligence.modes.auto') as ModeData;
  const modeThinking = t.raw('solutionCodeIntelligence.modes.thinking') as ModeData;
  const modes: Array<ModeData & { icon: string; accent?: boolean }> = [
    { ...modeInstant, icon: '\u26A1' },
    { ...modeAuto, icon: '\uD83D\uDD04', accent: true },
    { ...modeThinking, icon: '\uD83E\uDDE0' },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── 1. Hero ── */}
        <section className={s.hero}>
          <h1>{t('solutionCodeIntelligence.hero.title')}</h1>
          <p>{t('solutionCodeIntelligence.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionCodeIntelligence.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionCodeIntelligence.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* ── 2. Search Demo Mockup ── */}
        <div className={s.searchDemo} aria-hidden>
          <div className={s.searchInput}>
            <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{t('solutionCodeIntelligence.searchDemo.placeholder')}</span>
            <span className={s.searchLabel}>{t('solutionCodeIntelligence.searchDemo.label')}</span>
          </div>

          <div className={s.resultCards}>
            <div className={s.resultCard}>
              <div className={s.resultMeta}>
                <span className={s.resultPath}>packages/mind-engine/src/search/hybrid-search.ts</span>
                <span className={s.confidenceBadge}>0.92</span>
              </div>
              <span className={s.resultSnippet}>
                Combines BM25 keyword scoring with vector cosine similarity using Reciprocal Rank Fusion to merge ranked lists into a single result set.
              </span>
            </div>

            <div className={s.resultCard}>
              <div className={s.resultMeta}>
                <span className={s.resultPath}>packages/mind-engine/src/search/rrf-merger.ts</span>
                <span className={s.confidenceBadge}>0.87</span>
              </div>
              <span className={s.resultSnippet}>
                RRF formula: score(d) = 1/(k + rank_bm25(d)) + 1/(k + rank_vector(d)), default k=60 for balanced fusion weight.
              </span>
            </div>

            <div className={s.resultCard}>
              <div className={s.resultMeta}>
                <span className={s.resultPath}>packages/mind-engine/src/embeddings/vector-store.ts</span>
                <span className={s.confidenceBadge}>0.81</span>
              </div>
              <span className={s.resultSnippet}>
                VectorStore interface provides nearest-neighbor lookup over code chunk embeddings stored in Qdrant collections.
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. Accuracy Stats ── */}
        <section className={s.accuracy}>
          <h2>{t('solutionCodeIntelligence.accuracy.title')}</h2>
          <div className={s.accuracyBar}>
            <div className={s.accuracySegment}>
              <span>{t('solutionCodeIntelligence.accuracy.easy')}</span>
              <span className={s.accuracyScore}>0.63</span>
            </div>
            <div className={s.accuracySegment}>
              <span>{t('solutionCodeIntelligence.accuracy.medium')}</span>
              <span className={s.accuracyScore}>0.78</span>
            </div>
            <div className={s.accuracySegment}>
              <span>{t('solutionCodeIntelligence.accuracy.hard')}</span>
              <span className={s.accuracyScore}>0.70</span>
            </div>
          </div>
          <span className={s.accuracyAverage}>{t('solutionCodeIntelligence.accuracy.average')}</span>
        </section>

        {/* ── 4. Mode Cards ── */}
        <section className={s.modes}>
          <div className={s.modesHeader}>
            <h2>{t('solutionCodeIntelligence.modes.title')}</h2>
            <p>{t('solutionCodeIntelligence.modes.description')}</p>
          </div>
          <div className={s.modeGrid}>
            {modes.map((mode) => (
              <div key={mode.name} className={`${s.modeCard}${mode.accent ? ` ${s.modeCardAccent}` : ''}`}>
                <div className={s.modeTop}>
                  <span className={s.modeIcon}>{mode.icon}</span>
                  <span className={s.modeName}>{mode.name}</span>
                  {mode.badge && <span className={s.modeBadge}>{mode.badge}</span>}
                </div>
                <span className={s.modeSpeed}>{mode.speed}</span>
                <p className={s.modeDesc}>{mode.description}</p>
                <ul className={s.modeUseCases}>
                  {mode.useCases.map((uc) => (
                    <li key={uc}>{uc}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. Code Example ── */}
        <section className={s.codeExample}>
          <h2>{t('solutionCodeIntelligence.codeExample.title')}</h2>
          <div className={s.codeBlock}>
            <div className={s.codeBlockBar}>
              <span className={s.codeDot} />
              <span className={s.codeDot} />
              <span className={s.codeDot} />
              <span>Terminal</span>
            </div>
            <div className={s.codeContent}>
              <div className={s.codeLine}>
                <span className={s.codePrompt}>$ </span>
                <span className={s.codeCmd}>pnpm kb mind rag-query </span>
                <span className={s.codeFlag}>--text </span>
                <span className={s.codeString}>&quot;How does hybrid search work?&quot;</span>
                <span className={s.codeFlag}> --agent</span>
              </div>
              <span className={s.codeDivider} />
              <div className={s.codeLine}><span className={s.codeComment}>{'// Response (JSON)'}</span></div>
              <div className={s.codeLine}><span className={s.codeBrace}>{'{'}</span></div>
              <div className={s.codeLine}>{'  '}<span className={s.codeKey}>&quot;confidence&quot;</span>: <span className={s.codeNumber}>0.87</span>,</div>
              <div className={s.codeLine}>{'  '}<span className={s.codeKey}>&quot;mode&quot;</span>: <span className={s.codeValue}>&quot;auto&quot;</span>,</div>
              <div className={s.codeLine}>{'  '}<span className={s.codeKey}>&quot;sources&quot;</span>: [</div>
              <div className={s.codeLine}>{'    '}<span className={s.codeValue}>&quot;packages/mind-engine/src/search/hybrid-search.ts&quot;</span>,</div>
              <div className={s.codeLine}>{'    '}<span className={s.codeValue}>&quot;packages/mind-engine/src/search/rrf-merger.ts&quot;</span></div>
              <div className={s.codeLine}>{'  '}],</div>
              <div className={s.codeLine}>{'  '}<span className={s.codeKey}>&quot;answer&quot;</span>: <span className={s.codeValue}>&quot;Hybrid search combines BM25 keyword...&quot;</span></div>
              <div className={s.codeLine}><span className={s.codeBrace}>{'}'}</span></div>
            </div>
          </div>
        </section>

        {/* ── 6. Feature Grid (2x2) ── */}
        <div className={s.featureGrid}>
          {featureItems.map((item, i) => (
            <div key={item.title} className={s.featureCard}>
              <div className={s.featureCardIcon}>{FEATURE_ICONS[i]}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>

        {/* ── 7. CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionCodeIntelligence.cta.title')}</h2>
          <p>{t('solutionCodeIntelligence.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionCodeIntelligence.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionCodeIntelligence.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
