import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { WorkflowDemo } from '@/components/workflow-demo/WorkflowDemo';
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
    title: t('productWorkflows.meta.title'),
    description: t('productWorkflows.meta.description'),
    path: '/product/workflows',
  });
}

type Stat = { value: string; label: string };
type Bullet = { text: string };
type Benefit = { title: string; description: string };

export default async function WorkflowsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const stats = t.raw('productWorkflows.stats') as Stat[];
  const bullets = t.raw('productWorkflows.codeBullets') as Bullet[];
  const benefits = t.raw('productWorkflows.benefits') as Benefit[];

  const buildingBlocks = [
    {
      icon: '⌘',
      title: 'builtin:shell',
      description: 'Run any command — agent invocations, build scripts, API calls, notifications. The universal execution primitive.',
    },
    {
      icon: '◆',
      title: 'builtin:gate',
      description: 'Automatic decision point. Routes the pipeline based on step output: continue, fail, or rework loop with max iterations.',
    },
    {
      icon: '●',
      title: 'builtin:approval',
      description: 'Human-in-the-loop checkpoint. Pauses the pipeline until a person approves or rejects — with optional Slack notifications.',
    },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <h1>{t('productWorkflows.hero.title')}</h1>
          <p>{t('productWorkflows.hero.description')}</p>
          <div className={s.heroCta}>
            <Link className="btn primary" href={`/${locale}/install`}>{t('productWorkflows.hero.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productWorkflows.hero.contactBtn')}</Link>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <section className={s.statsBar}>
          <div className={s.statsInner}>
            {stats.map((stat) => (
              <div key={stat.label} className={s.statItem}>
                <span className={s.statNumber}>{stat.value}</span>
                <span className={s.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Interactive Demo (compact) ── */}
        <section className={s.demoSection}>
          <div className={s.demoHeader}>
            <h2>See it in action</h2>
            <p>Run a real dev-cycle pipeline — from AI planning to commit. Click &quot;Run Pipeline&quot; and approve each gate.</p>
          </div>
          <WorkflowDemo compact demoLink={`/${locale}/demo`} />
        </section>

        {/* ── YAML code showcase ── */}
        <section className={s.codeShowcase}>
          <div className={s.codeBlock}>
            <div className={s.codeBlockHeader}>
              <span className={s.codeDot} />
              <span className={s.codeDot} />
              <span className={s.codeDot} />
              <span className={s.codeFileName}>workflow.yaml</span>
            </div>
            <pre><code>{`\
`}<span className={s.yamlKey}>name</span>{`: `}<span className={s.yamlString}>deploy-production</span>{`
`}<span className={s.yamlKey}>trigger</span>{`: `}<span className={s.yamlString}>push:main</span>{`

`}<span className={s.yamlKey}>steps</span>{`:
  - `}<span className={s.yamlKey}>id</span>{`: `}<span className={s.yamlString}>build</span>{`
    `}<span className={s.yamlKey}>run</span>{`: `}<span className={s.yamlString}>pnpm run build</span>{`
    `}<span className={s.yamlKey}>parallel</span>{`: `}<span className={s.yamlBool}>true</span>{`

  - `}<span className={s.yamlKey}>id</span>{`: `}<span className={s.yamlString}>test</span>{`
    `}<span className={s.yamlKey}>run</span>{`: `}<span className={s.yamlString}>pnpm run test</span>{`
    `}<span className={s.yamlKey}>needs</span>{`: [`}<span className={s.yamlString}>build</span>{`]

  - `}<span className={s.yamlKey}>id</span>{`: `}<span className={s.yamlString}>review</span>{`
    `}<span className={s.yamlKey}>plugin</span>{`: `}<span className={s.yamlString}>@kb-labs/ai-review</span>{`
    `}<span className={s.yamlKey}>mode</span>{`: `}<span className={s.yamlString}>full</span>{`

  - `}<span className={s.yamlKey}>id</span>{`: `}<span className={s.yamlString}>deploy</span>{`
    `}<span className={s.yamlKey}>run</span>{`: `}<span className={s.yamlString}>./scripts/deploy.sh</span>{`
    `}<span className={s.yamlKey}>needs</span>{`: [`}<span className={s.yamlString}>test</span>{`, `}<span className={s.yamlString}>review</span>{`]
    `}<span className={s.yamlKey}>retry</span>{`: `}<span className={s.yamlNumber}>3</span></code></pre>
          </div>

          <div className={s.codeExplanation}>
            <h2>{t('productWorkflows.codeSection.title')}</h2>
            <p>{t('productWorkflows.codeSection.description')}</p>
            <ul className={s.bulletList}>
              {bullets.map((bullet) => (
                <li key={bullet.text}>
                  <span className={s.bulletIcon}>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5 6 5.5 9 9.5 3" />
                    </svg>
                  </span>
                  {bullet.text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Building Blocks ── */}
        <section className={s.blocksSection}>
          <h2 className={s.blocksTitle}>Three primitives. Any pipeline.</h2>
          <p className={s.blocksSubtitle}>
            Every workflow — from a simple dev-cycle to enterprise compliance — is composed from just three building blocks.
          </p>
          <div className={s.blocksGrid}>
            {buildingBlocks.map((block) => (
              <div key={block.title} className={s.blockCard}>
                <div className={s.blockIconWrap}>
                  <span className={s.blockIcon}>{block.icon}</span>
                </div>
                <h3><code>{block.title}</code></h3>
                <p>{block.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3-column benefits grid ── */}
        <section className={s.benefitsSection}>
          <h2 className={s.benefitsTitle}>{t('productWorkflows.benefitsTitle')}</h2>
          <p className={s.benefitsSubtitle}>{t('productWorkflows.benefitsSubtitle')}</p>
          <div className={s.benefitsGrid}>
            {benefits.map((benefit) => (
              <div key={benefit.title} className={s.benefitCard}>
                <div className={s.benefitIcon}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="14" height="14" rx="3" />
                    <path d="M7 10h6M10 7v6" />
                  </svg>
                </div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>{t('productWorkflows.cta.title')}</h2>
          <p>{t('productWorkflows.cta.description')}</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>{t('productWorkflows.cta.startBtn')}</Link>
            <Link className="btn secondary" href={`/${locale}/contact`}>{t('productWorkflows.cta.contactBtn')}</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
