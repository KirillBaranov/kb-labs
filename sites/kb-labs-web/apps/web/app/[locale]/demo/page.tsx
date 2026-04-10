import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
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
  return buildPageMetadata({
    locale,
    title: 'Interactive Demo — KB Labs',
    description: 'See KB Labs workflow engine in action. Run a simulated AI-assisted development pipeline — from planning to commit.',
    path: '/demo',
  });
}

export default async function DemoPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.badge}>Interactive Demo</span>
          <h1>See the pipeline in action</h1>
          <p>
            Run a simulated AI-assisted development pipeline. Switch between a standard dev-cycle
            and an enterprise compliance flow. Click &quot;Run Pipeline&quot; to start — approve gates
            to progress.
          </p>
        </section>

        {/* ── Full Demo ── */}
        <section className={s.demoWrap}>
          <WorkflowDemo />
        </section>

        {/* ── How It Works ── */}
        <section className={s.explainer}>
          <h2>What you just saw</h2>
          <div className={s.explainerGrid}>
            <div className={s.explainerCard}>
              <div className={s.explainerIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l2.5 1.5" />
                </svg>
              </div>
              <h3>Real workflow steps</h3>
              <p>Each step maps to a real YAML definition. The same engine runs your automation in production.</p>
            </div>
            <div className={s.explainerCard}>
              <div className={s.explainerIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10h14M10 3v14" />
                </svg>
              </div>
              <h3>Composable from 3 blocks</h3>
              <p><code>shell</code>, <code>gate</code>, and <code>approval</code> — three primitives that compose into any pipeline.</p>
            </div>
            <div className={s.explainerCard}>
              <div className={s.explainerIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8l3 3 3-3" />
                  <path d="M10 8l3 3 3-3" />
                </svg>
              </div>
              <h3>Rework loops</h3>
              <p>Failed review? The gate automatically sends changes back for rework — up to 3 iterations.</p>
            </div>
            <div className={s.explainerCard}>
              <div className={s.explainerIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="14" height="14" rx="2" />
                  <path d="M7 10l2 2 4-4" />
                </svg>
              </div>
              <h3>Human-in-the-loop</h3>
              <p>Approval gates pause the pipeline until a human decides. Add as many as your compliance requires.</p>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="final-cta-block reveal">
          <h2>Ready to build your own pipeline?</h2>
          <p>Install KB Labs on-prem and define workflows as YAML — from simple dev-cycles to enterprise compliance.</p>
          <div className="cta-row">
            <Link className="btn primary" href={`/${locale}/install`}>Install On-Prem</Link>
            <Link className="btn secondary" href={`/${locale}/product/workflows`}>Learn more</Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
