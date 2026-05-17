import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { BeliefsSection } from '@/components/sections/BeliefsSection';
import { BuiltInOpenSection } from '@/components/sections/BuiltInOpenSection';
import { FaqSection } from '@/components/sections/FaqSection';
import { HeroSection } from '@/components/sections/HeroSection';
import { SameRailsSection } from '@/components/sections/SameRailsSection';
import { StartBesideSection } from '@/components/sections/StartBesideSection';
import { TrustStripSection } from '@/components/sections/TrustStripSection';
import { UseCasesSection } from '@/components/sections/UseCasesSection';

type HomeSectionsPageProps = {
  locale: string;
};

type BeliefRow = {
  id: string;
  belief: string;
  answer: string;
  answerLead: string;
  linkLabel: string;
  linkHref: string;
};

type SecurityMarker = { label: string; href: string };

type SameRailsPoint = { title: string; description: string };

type StartBesideStep = { num: string; title: string; description: string };

type BuiltInOpenDoor = {
  id: string;
  label: string;
  description: string;
  href: string;
  external?: boolean;
};

export async function HomeSectionsPage({ locale }: HomeSectionsPageProps) {
  const t = await getTranslations({ locale });

  const heroTitle = t('home.hero.title');
  const heroDescription = t('home.hero.description');
  const heroBody = t('home.hero.body');
  const heroCta1 = t('home.hero.cta1');
  const heroCta2 = t('home.hero.cta2');

  const beliefsTitle = t('home.beliefs.title');
  const beliefsLead = t('home.beliefs.lead');
  const beliefsRows = t.raw('home.beliefs.rows') as BeliefRow[];

  const trustLabel = t('home.trust.label');
  const trustItems = t.raw('home.trust.items') as string[];
  const trustSecurityMarkers = t.raw('home.trust.securityMarkers') as SecurityMarker[];

  const sameRailsTitle = t('home.sameRails.title');
  const sameRailsLead = t('home.sameRails.lead');
  const sameRailsPoints = t.raw('home.sameRails.points') as SameRailsPoint[];
  const sameRailsCaption = t('home.sameRails.caption');

  const startBesideTitle = t('home.startBeside.title');
  const startBesideLead = t('home.startBeside.lead');
  const startBesideSteps = t.raw('home.startBeside.steps') as StartBesideStep[];
  const startBesideNote = t('home.startBeside.note');
  const startBesideCta = t('home.startBeside.cta');
  const startBesideCtaHref = t('home.startBeside.ctaHref');

  const useCases = t.raw('home.useCases.items') as Array<{
    title: string;
    hook: string;
    situation: string;
    how: string;
    result: string;
    owner: string;
  }>;

  const faqItems = t.raw('home.faq.items') as Array<{ q: string; a: string }>;

  const builtInOpenTitle = t('home.builtInOpen.title');
  const builtInOpenLead = t('home.builtInOpen.lead');
  const builtInOpenDoors = t.raw('home.builtInOpen.doors') as BuiltInOpenDoor[];

  const lp = (path: string) => `/${locale}${path}`;
  const localizeHref = (href: string) =>
    href.startsWith('/') && !href.startsWith('//') ? lp(href) : href;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <HeroSection
          title={heroTitle}
          description={heroDescription}
          body={heroBody}
          cta1={heroCta1}
          cta2={heroCta2}
          cta1Href={lp('/install')}
          cta2Href="https://github.com/KirillBaranov/kb-labs"
        />
        <div className="container stack">
          {/* ─── 1. Three things we believe ────────────────────────── */}
          <BeliefsSection
            title={beliefsTitle}
            lead={beliefsLead}
            rows={beliefsRows.map((row) => ({
              ...row,
              linkHref: localizeHref(row.linkHref),
            }))}
          />

          {/* ─── 2. We run on it + security markers ────────────────── */}
          <TrustStripSection
            label={trustLabel}
            items={trustItems}
            securityMarkers={trustSecurityMarkers.map((marker) => ({
              ...marker,
              href: localizeHref(marker.href),
            }))}
          />

          {/* ─── 3. Same rails ─────────────────────────────────────── */}
          <SameRailsSection
            title={sameRailsTitle}
            lead={sameRailsLead}
            points={sameRailsPoints}
            caption={sameRailsCaption}
          />

          {/* ─── 4. Start beside your stack ────────────────────────── */}
          <StartBesideSection
            title={startBesideTitle}
            lead={startBesideLead}
            steps={startBesideSteps}
            note={startBesideNote}
            cta={startBesideCta}
            ctaHref={localizeHref(startBesideCtaHref)}
          />

          {/* ─── 5. Use cases ──────────────────────────────────────── */}
          <UseCasesSection
            title={t('home.useCases.title')}
            description={t('home.useCases.description')}
            items={useCases}
            labels={{
              situation: t('home.useCases.labels.situation'),
              how: t('home.useCases.labels.how'),
              result: t('home.useCases.labels.result'),
              owner: t('home.useCases.labels.owner'),
            }}
            ctaLabel={t('home.useCases.cta')}
            ctaHref={lp('/use-cases')}
          />

          {/* ─── 6. FAQ ────────────────────────────────────────────── */}
          <FaqSection title={t('home.faq.title')} items={faqItems} />

          {/* ─── 7. Built in the open ──────────────────────────────── */}
          <BuiltInOpenSection
            title={builtInOpenTitle}
            lead={builtInOpenLead}
            doors={builtInOpenDoors.map((door) => ({
              ...door,
              href: door.external ? door.href : localizeHref(door.href),
            }))}
          />

          {/* ─── 8. Final CTA (shared pattern with other pages) ───── */}
          <section className="final-cta-block reveal">
            <h2>{t('home.finalCta.title')}</h2>
            <p>{t('home.finalCta.description')}</p>
            <div className="cta-row">
              <Link className="btn primary" href={lp('/install')}>
                {t('home.finalCta.installBtn')}
              </Link>
              <Link className="btn secondary" href={lp('/contact')}>
                {t('home.finalCta.contactBtn')}
              </Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
