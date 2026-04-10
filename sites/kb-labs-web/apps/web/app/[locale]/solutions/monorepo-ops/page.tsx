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
    title: t('solutionMonorepoOps.meta.title'),
    description: t('solutionMonorepoOps.meta.description'),
    path: '/solutions/monorepo-ops',
  });
}

type ToolCategory = { title: string; count: string; description: string };

/* Repo groups for the scale visualization — approximate distribution */
const REPO_GROUPS = [
  { name: 'core', count: 12 },
  { name: 'cli', count: 8 },
  { name: 'plugins', count: 18 },
  { name: 'adapters', count: 17 },
  { name: 'agents', count: 6 },
  { name: 'mind', count: 5 },
  { name: 'workflow', count: 8 },
  { name: 'devlink', count: 3 },
  { name: 'review', count: 4 },
  { name: 'quality', count: 3 },
  { name: 'commit', count: 4 },
  { name: 'release', count: 5 },
  { name: 'rest-api', count: 3 },
  { name: 'studio', count: 3 },
  { name: 'devkit', count: 6 },
  { name: 'gateway', count: 2 },
  { name: 'sdk', count: 4 },
  { name: 'shared', count: 14 },
];

const TOOL_CATEGORY_ICONS = [
  /* Analysis — magnifying glass */
  <svg key="t1" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  /* Automation — gear */
  <svg key="t2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  /* Infrastructure — server */
  <svg key="t3" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>,
  /* Health — heart */
  <svg key="t4" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  /* Build Order — layers */
  <svg key="t5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  /* Types Audit — file-text */
  <svg key="t6" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
];

export default async function MonorepoOpsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const toolCategories = t.raw('solutionMonorepoOps.toolCategories') as ToolCategory[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* -- 1. Hero -- */}
        <section className={s.hero}>
          <h1>{t('solutionMonorepoOps.hero.title')}</h1>
          <p className={s.heroStat}>{t('solutionMonorepoOps.hero.stat')}</p>
          <p className={s.heroDesc}>{t('solutionMonorepoOps.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionMonorepoOps.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionMonorepoOps.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* -- 2. Monorepo Scale Visualization -- */}
        <section className={s.scaleSection}>
          <div className={s.scaleViz} aria-hidden>
            {REPO_GROUPS.map((group) => (
              <div key={group.name} className={s.repoGroup}>
                <div className={s.dotGrid}>
                  {Array.from({ length: group.count }).map((_, i) => (
                    <span key={i} className={s.packageDot} />
                  ))}
                </div>
                <span className={s.repoLabel}>{group.name}</span>
              </div>
            ))}
          </div>
          <p className={s.scaleCaption}>{t('solutionMonorepoOps.scale.caption')}</p>
        </section>

        {/* -- 3. Tool Showcase (2x3 grid) -- */}
        <section className={s.showcaseSection}>
          <div className={s.showcaseHeader}>
            <h2>{t('solutionMonorepoOps.showcase.title')}</h2>
            <p>{t('solutionMonorepoOps.showcase.subtitle')}</p>
          </div>
          <div className={s.showcaseGrid}>
            {toolCategories.map((cat, i) => (
              <div key={cat.title} className={s.showcaseCard}>
                <div className={s.showcaseIcon}>{TOOL_CATEGORY_ICONS[i] ?? TOOL_CATEGORY_ICONS[0]}</div>
                <div className={s.showcaseContent}>
                  <div className={s.showcaseTop}>
                    <h3>{cat.title}</h3>
                    <span className={s.toolCount}>{cat.count}</span>
                  </div>
                  <p>{cat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* -- 4. Terminal Mockup -- */}
        <section className={s.terminalSection}>
          <h2>{t('solutionMonorepoOps.terminal.title')}</h2>
          <div className={s.terminalBlock}>
            <div className={s.termBar}>
              <span className={s.termDot} />
              <span className={s.termDot} />
              <span className={s.termDot} />
              <span>Terminal</span>
            </div>
            <div className={s.termBody}>
              <div className={s.termLine}><span className={s.termPrompt}>$ </span><span className={s.termCmd}>npx kb-devkit-health</span></div>
              <div className={s.termLine}>&nbsp;</div>
              <div className={s.termLine}><span className={s.termHeader}>KB Labs Monorepo Health Check</span></div>
              <div className={s.termLine}>&nbsp;</div>
              <div className={s.termLine}><span className={s.termLabel}>Packages:</span>    <span className={s.termVal}>125</span></div>
              <div className={s.termLine}><span className={s.termLabel}>Repositories:</span> <span className={s.termVal}>18</span></div>
              <div className={s.termLine}><span className={s.termLabel}>Build layers:</span> <span className={s.termVal}>13</span></div>
              <div className={s.termLine}>&nbsp;</div>
              <div className={s.termLine}><span className={s.termLabel}>Missing deps:</span>  <span className={s.termGreen}>0</span></div>
              <div className={s.termLine}><span className={s.termLabel}>Build failures:</span> <span className={s.termGreen}>0</span></div>
              <div className={s.termLine}><span className={s.termLabel}>Type errors:</span>    <span className={s.termYellow}>2,408</span> <span className={s.termDim}>(baselined)</span></div>
              <div className={s.termLine}>&nbsp;</div>
              <div className={s.termLine}><span className={s.termLabel}>Health Score:</span>   <span className={s.termAccent}>68/100</span> <span className={s.termDim}>(Grade D)</span></div>
              <div className={s.termLine}>&nbsp;</div>
              <div className={s.termLine}><span className={s.termGreen}>Done</span> in 12.4s</div>
            </div>
          </div>
        </section>

        {/* -- 5. DevLink Section -- */}
        <section className={s.devlinkSection}>
          <div className={s.devlinkContent}>
            <h2>{t('solutionMonorepoOps.devlink.title')}</h2>
            <p>{t('solutionMonorepoOps.devlink.problem')}</p>
            <p>{t('solutionMonorepoOps.devlink.solution')}</p>
          </div>
          <div className={s.devlinkCommand}>
            <div className={s.cmdBlock}>
              <div className={s.cmdBar}>
                <span className={s.termDot} />
                <span className={s.termDot} />
                <span className={s.termDot} />
              </div>
              <div className={s.cmdBody}>
                <div className={s.termLine}><span className={s.termPrompt}>$ </span><span className={s.termCmd}>pnpm kb devlink switch \</span></div>
                <div className={s.termLine}>    <span className={s.termFlag}>--mode=local</span> <span className={s.termFlag}>--install</span></div>
                <div className={s.termLine}>&nbsp;</div>
                <div className={s.termLine}><span className={s.termGreen}>Switched 125 packages across 18 repos</span></div>
                <div className={s.termLine}><span className={s.termGreen}>Workspace files regenerated</span></div>
                <div className={s.termLine}><span className={s.termGreen}>Lockfiles cleaned + pnpm install done</span></div>
              </div>
            </div>
            <span className={s.cmdTagline}>{t('solutionMonorepoOps.devlink.tagline')}</span>
          </div>
        </section>

        {/* -- 6. CTA -- */}
        <section className="final-cta-block reveal">
          <h2>{t('solutionMonorepoOps.cta.title')}</h2>
          <p>{t('solutionMonorepoOps.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('solutionMonorepoOps.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('solutionMonorepoOps.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
