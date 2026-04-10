'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

export function SiteFooter() {
  const locale = useLocale();
  const t = useTranslations();

  const lp = (path: string) => `/${locale}${path}`;

  /* ── Row 1: Product ─────────────────────────────────────────────── */
  const row1 = [
    {
      title: t('footer.sections.platform.title'),
      links: [
        { label: t('footer.sections.platform.workflowEngine'), href: lp('/product/workflows') },
        { label: t('footer.sections.platform.pluginSystem'), href: lp('/product/plugins') },
        { label: t('footer.sections.platform.stateBroker'), href: lp('/product/state-broker') },
        { label: t('footer.sections.platform.productOverview'), href: lp('/product') },
      ],
    },
    {
      title: t('footer.sections.solutions.title'),
      links: [
        { label: t('footer.sections.solutions.releaseAutomation'), href: lp('/solutions/release-automation') },
        { label: t('footer.sections.solutions.codeIntelligence'), href: lp('/solutions/code-intelligence') },
        { label: t('footer.sections.solutions.codeQuality'), href: lp('/solutions/code-quality') },
        { label: t('footer.sections.solutions.monorepoOps'), href: lp('/solutions/monorepo-ops') },
        { label: t('footer.sections.solutions.aiGateway'), href: lp('/solutions/gateway') },
        { label: t('footer.sections.solutions.platformApi'), href: lp('/solutions/platform-api') },
        { label: t('footer.sections.solutions.observability'), href: lp('/solutions/observability') },
      ],
    },
    {
      title: t('footer.sections.developers.title'),
      links: [
        { label: t('footer.sections.build.docs'), href: 'https://docs.kblabs.ru' },
        { label: t('footer.sections.developers.sdk'), href: 'https://docs.kblabs.ru/sdk' },
        { label: t('footer.sections.developers.cli'), href: 'https://docs.kblabs.ru/reference/cli' },
        { label: t('footer.sections.developers.restApi'), href: 'https://docs.kblabs.ru/reference/rest-api' },
        { label: t('footer.sections.build.studio'), href: 'https://docs.kblabs.ru/services/studio' },
        { label: t('footer.sections.developers.kbDev'), href: lp('/kb-dev') },
      ],
    },
    {
      title: t('footer.sections.marketplace.title'),
      links: [
        { label: t('footer.sections.marketplace.browse'), href: lp('/marketplace') },
        { label: t('footer.sections.marketplace.official'), href: lp('/marketplace#official') },
        { label: t('footer.sections.marketplace.community'), href: lp('/marketplace#community') },
      ],
    },
    {
      title: t('footer.sections.resources.title'),
      links: [
        { label: t('footer.sections.start.pricing'), href: lp('/pricing') },
        { label: t('footer.sections.start.enterprise'), href: lp('/enterprise') },
        { label: t('footer.sections.resources.useCases'), href: lp('/use-cases') },
        { label: t('footer.sections.compare'), href: lp('/compare') },
      ],
    },
    {
      title: t('footer.sections.learn.title'),
      links: [
        { label: t('footer.sections.learn.blog'), href: lp('/blog') },
        { label: t('footer.sections.learn.changelog'), href: lp('/changelog') },
        { label: t('footer.sections.learn.roadmap'), href: lp('/roadmap') },
        { label: t('footer.sections.learn.demo'), href: lp('/demo') },
      ],
    },
  ];

  /* ── Row 2: Company & Community ─────────────────────────────────── */
  const row2 = [
    {
      title: t('footer.sections.getStarted.title'),
      links: [
        { label: t('footer.sections.getStarted.install'), href: lp('/install') },
        { label: t('footer.sections.getStarted.pricing'), href: lp('/pricing') },
        { label: t('footer.sections.getStarted.enterprise'), href: lp('/enterprise') },
        { label: t('footer.sections.getStarted.demo'), href: lp('/demo') },
      ],
    },
    {
      title: t('footer.sections.secure.title'),
      links: [
        { label: t('footer.sections.secure.security'), href: lp('/security') },
        { label: t('footer.sections.secure.privacy'), href: lp('/legal/privacy') },
        { label: t('footer.sections.secure.terms'), href: lp('/legal/terms') },
        { label: t('footer.sections.secure.dpa'), href: lp('/legal/dpa') },
        { label: t('footer.sections.secure.cookies'), href: lp('/legal/cookies') },
      ],
    },
    {
      title: t('footer.sections.company.title'),
      links: [
        { label: t('footer.sections.company.about'), href: lp('/about') },
        { label: t('footer.sections.company.contact'), href: lp('/contact') },
        { label: t('footer.sections.company.blog'), href: lp('/blog') },
        { label: t('footer.sections.roadmap'), href: lp('/roadmap') },
      ],
    },
    {
      title: t('footer.sections.community.title'),
      links: [
        { label: t('footer.sections.community.github'), href: 'https://github.com/KirillBaranov/kb-labs', icon: 'github' },
        { label: t('footer.sections.community.discord'), href: 'https://discord.gg/kblabs', icon: 'discord' },
        { label: t('footer.sections.community.twitter'), href: 'https://twitter.com/kblabs_dev', icon: 'x' },
        { label: t('footer.sections.community.founder'), href: 'https://k-baranov.ru' },
      ],
    },
  ];

  const currentYear = new Date().getFullYear();

  const icons: Record<string, React.ReactNode> = {
    github: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>,
    discord: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
    x: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  };

  const renderLink = (item: { label: string; href: string; icon?: string }) => {
    const isInternal = item.href.startsWith('/');
    const content = (
      <>
        {item.icon && <span className="footer-link-icon">{icons[item.icon]}</span>}
        {item.label}
      </>
    );
    return isInternal ? (
      <Link key={item.href} href={item.href}>{content}</Link>
    ) : (
      <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{content}</a>
    );
  };

  return (
    <footer className="footer">
      <div className="footer-shell">
        {/* Brand */}
        <div className="footer-brand">
          <strong className="footer-logo">KB Labs</strong>
        </div>

        {/* Row 1 */}
        <div className="footer-grid">
          {row1.map((group) => (
            <section key={group.title} className="footer-group">
              <h4>{group.title}</h4>
              <div className="footer-group-links">{group.links.map(renderLink)}</div>
            </section>
          ))}
        </div>

        {/* Row 2 */}
        <div className="footer-grid footer-grid--row2">
          {row2.map((group) => (
            <section key={group.title} className="footer-group">
              <h4>{group.title}</h4>
              <div className="footer-group-links">{group.links.map(renderLink)}</div>
            </section>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bar">
        <div className="footer-shell">
          <div className="footer-bar-inner">
            <small>&copy; {currentYear} KB Labs. {t('footer.legal')}</small>
          </div>
        </div>
      </div>
    </footer>
  );
}
