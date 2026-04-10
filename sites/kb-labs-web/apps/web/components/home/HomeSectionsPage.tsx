import { getTranslations } from 'next-intl/server';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { FaqSection } from '@/components/sections/FaqSection';
import { FinalCtaSection } from '@/components/sections/FinalCtaSection';
import { GatewayHookSection } from '@/components/sections/GatewayHookSection';
import { HeroSection } from '@/components/sections/HeroSection';
import { PricingPreviewSection } from '@/components/sections/PricingPreviewSection';
import { ReplaceSection } from '@/components/sections/ReplaceSection';
import { SecuritySection } from '@/components/sections/SecuritySection';
import { TrustStripSection } from '@/components/sections/TrustStripSection';
import { UseCasesSection } from '@/components/sections/UseCasesSection';
import { WorkflowSection } from '@/components/sections/WorkflowSection';

type HomeSectionsPageProps = {
  locale: string;
};

export async function HomeSectionsPage({ locale }: HomeSectionsPageProps) {
  const t = await getTranslations({ locale });

  const heroTitle = t('home.hero.title');
  const heroDescription = t('home.hero.description');
  const heroBody = t('home.hero.body');
  const heroCta1 = t('home.hero.cta1');
  const heroCta2 = t('home.hero.cta2');

  const trustLabel = t('home.trust.label');
  const trustItems = (t.raw('home.trust.items') as string[]);

  const workflowSteps = (t.raw('home.workflow.steps') as Array<{ title: string; description: string }>);
  const workflowKpis = (t.raw('home.workflow.kpis') as string[]);

  const useCases = (t.raw('home.useCases.items') as Array<{
    title: string;
    hook: string;
    situation: string;
    how: string;
    result: string;
    owner: string;
  }>);

  const securityFeatures = (t.raw('home.security.features') as Array<{ label: string; description: string }>);

  const faqItems = (t.raw('home.faq.items') as Array<{ q: string; a: string }>);

  const lp = (path: string) => `/${locale}${path}`;

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
          {/* ─── Section A — Workflows / routine pain ──────────────── */}
          <WorkflowSection
            title={t('home.workflow.title')}
            lead={t('home.workflow.lead')}
            sideText={t('home.workflow.sideText')}
            kpis={workflowKpis}
            ctaLabel={t('home.workflow.cta')}
            ctaHref={lp('/product#workflows')}
            steps={workflowSteps}
          />
          <ReplaceSection
            title={t('home.replace.title')}
            beforeLabel={t('home.replace.beforeLabel')}
            afterLabel={t('home.replace.afterLabel')}
            note={t('home.replace.note')}
            rows={t.raw('home.replace.rows') as Array<{ before: string; after: string }>}
          />
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

          {/* ─── Founder moment between Section A and Section B ────── */}
          <aside className="founder-moment reveal">
            <p className="founder-quote">«{t('home.founder.quote')}»</p>
            <p className="founder-attribution">— {t('home.founder.attribution')}</p>
            <a className="founder-more" href="https://k-baranov.ru" target="_blank" rel="noopener noreferrer">
              {t('home.founder.moreLink')}
            </a>
          </aside>

          {/* ─── Section B — Gateway / broker scar ─────────────────── */}
          <GatewayHookSection
            title={t('home.gatewayHook.title')}
            lead={t('home.gatewayHook.lead')}
            honesty={t('home.gatewayHook.honesty')}
            ctaLabel={t('home.gatewayHook.cta')}
            ctaHref={lp('/product#gateway')}
            configCaption={t('home.gatewayHook.configCaption')}
            codeCaption={t('home.gatewayHook.codeCaption')}
            codeNote={t('home.gatewayHook.codeNote')}
            adapters={t.raw('home.gatewayHook.adapters') as Array<{
              id: string;
              label: string;
              packageName: string;
              badge: string;
            }>}
          />

          {/* ─── Trust + security + pricing + FAQ ──────────────────── */}
          <TrustStripSection label={trustLabel} items={trustItems} />
          <SecuritySection
            title={t('home.security.title')}
            description={t('home.security.description')}
            ctaLabel={t('home.security.cta')}
            features={securityFeatures}
          />
          <PricingPreviewSection
            title={t('home.pricing.title')}
            description={t('home.pricing.description')}
            tiers={[
              {
                name: t('home.pricing.tiers.oss.name'),
                price: t('home.pricing.tiers.oss.price'),
                note: t('home.pricing.tiers.oss.note'),
                cta: t('home.pricing.tiers.oss.cta'),
                href: 'https://docs.kblabs.ru',
              },
              {
                name: t('home.pricing.tiers.enterprise.name'),
                price: t('home.pricing.tiers.enterprise.price'),
                note: t('home.pricing.tiers.enterprise.note'),
                cta: t('home.pricing.tiers.enterprise.cta'),
                href: lp('/contact'),
                featured: true,
              },
            ]}
          />
          <FaqSection title={t('home.faq.title')} items={faqItems} />
          <FinalCtaSection
            title={t('home.finalCta.title')}
            description={t('home.finalCta.description')}
            cta1={t('home.finalCta.cta1')}
            cta2={t('home.finalCta.cta2')}
            cta3={t('home.finalCta.cta3')}
            cta1Href={lp('/install')}
            cta2Href={lp('/contact')}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
