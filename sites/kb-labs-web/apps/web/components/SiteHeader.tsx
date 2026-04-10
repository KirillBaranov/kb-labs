'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NAV_DROPDOWNS, NAV_LINKS, MOBILE_EXTRA_PRODUCT_ITEMS, MENU_ORDER as MENU_ORDER_CFG } from './nav-config';

const AiAssistant = dynamic(
  () => import('./ai-assistant/AiAssistant').then((m) => ({ default: m.AiAssistant })),
  { ssr: false },
);

const ICONS: Record<string, React.ReactNode> = {
  Workflows: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 8v5M8 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'Plugin System': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 1v3M9 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="1.5" y="4" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 11v2M9.5 11v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'State Broker': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="2" cy="3" r="1.3" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="12" cy="3" r="1.3" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="2" cy="11" r="1.3" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="12" cy="11" r="1.3" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3.2 3.8L5.5 5.5M8.5 8.5l2.3 1.7M10.8 3.8L8.5 5.5M5.5 8.5L3.2 10.2" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  ),
  CLI: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 6l2 1.5L4 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  SDK: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4.5 4.5L1 7l3.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.5 4.5L13 7l-3.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 2.5L6 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'REST API': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 4.5h11M1.5 7h7M1.5 9.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Studio: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1 5h12" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3.5" cy="3" r="0.8" fill="currentColor"/>
      <circle cx="6" cy="3" r="0.8" fill="currentColor"/>
    </svg>
  ),
  'Release Automation': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M4.5 5L7 1l2.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 11.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 9.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'Mind RAG': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8.5 8.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'Code Quality': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L2 3.5V7c0 2.8 2 4.8 5 5.5 3-.7 5-2.7 5-5.5V3.5L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 7l1.5 1.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'Monorepo Ops': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  'Gateway': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5h8M3 9h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="5.5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="8.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  'Observability': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <polyline points="2 10 5 6 8 8 12 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="10 3 12 3 12 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'Platform API': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="2" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="2" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  'kb-dev': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 6.5l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  'kb-devkit': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="4" width="12" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 7.5l1.5 1.5L4 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="5" y="2" width="4" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
};


const MENU_ORDER = MENU_ORDER_CFG;

function MobileSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mob-section">
      <button className="mob-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{label}</span>
        <svg className={`mob-chevron${open ? ' mob-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`mob-content${open ? ' mob-content--open' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const prevMenu = useRef<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lp = (path: string) => `/${locale}${path}`;
  const isActive = (path: string) => pathname === lp(path) || pathname.startsWith(lp(path) + '/');

  // Body scroll lock when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const closeMobile = () => setMobileOpen(false);

  function handleEnter(name: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (activeMenu && activeMenu !== name) {
      prevMenu.current = activeMenu;
    }
    setActiveMenu(name);
  }

  function handleLeave() {
    closeTimer.current = setTimeout(() => {
      prevMenu.current = null;
      setActiveMenu(null);
    }, 180);
  }

  // sliding direction: +1 = new menu is to the right of prev, -1 = to the left
  function getSlideDir(name: string): number {
    if (!prevMenu.current) return 0;
    const prev = MENU_ORDER.indexOf(prevMenu.current);
    const curr = MENU_ORDER.indexOf(name);
    return curr > prev ? 1 : -1;
  }

  const isOpen = (name: string) => activeMenu === name;

  const slideDir = getSlideDir(activeMenu ?? '');

  return (
    <header className="topbar">
      <div className="nav">
        <div className="nav-left">
          <Link className="brand" href={lp('/')}>KB Labs</Link>
          <nav
            className="nav-links"
            onMouseLeave={handleLeave}
          >
            <div className="nav-mega-wrap" onMouseEnter={() => handleEnter('product')}>
              <button className="nav-link nav-mega-trigger" aria-expanded={isOpen('product')}>
                {t('nav.product')}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="nav-mega-wrap" onMouseEnter={() => handleEnter('solutions')}>
              <button className="nav-link nav-mega-trigger" aria-expanded={isOpen('solutions')}>
                {t('nav.solutions')}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="nav-mega-wrap" onMouseEnter={() => handleEnter('resources')}>
              <button className="nav-link nav-mega-trigger" aria-expanded={isOpen('resources')}>
                {t('nav.resources')}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <a className="nav-link" href="https://docs.kblabs.ru" target="_blank" rel="noopener noreferrer">{t('nav.docs')}</a>
            <Link className={`nav-link${isActive('/pricing') ? ' active' : ''}`} href={lp('/pricing')}>{t('nav.pricing')}</Link>

            {/* Single shared megamenu container */}
            <div
              className={`megamenu${activeMenu ? ' megamenu--open' : ''}`}
              data-slide={slideDir}
              onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}
            >
              {/* ── Product panel (Platform + Developer) ── */}
              <div className={`megamenu-panel${activeMenu === 'product' ? ' megamenu-panel--active' : ''}`} style={{ '--menu-cols': '1fr 1fr' } as React.CSSProperties}>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.platform.label')}</span>
                  {([
                    ['Workflows', 'platform.workflows', '/product/workflows'],
                    ['Plugin System', 'platform.plugins', '/product/plugins'],
                    ['State Broker', 'platform.stateBroker', '/product/state-broker'],
                  ] as const).map(([icon, key, href]) => (
                    <a key={icon} className="megamenu-item" href={lp(href)}>
                      <span className="megamenu-item-icon">{ICONS[icon]}</span>
                      <span>
                        <span className="megamenu-item-label">{t(`nav.megamenu.${key}.title`)}</span>
                        <span className="megamenu-item-desc">{t(`nav.megamenu.${key}.description`)}</span>
                      </span>
                    </a>
                  ))}
                </div>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.developer.label')}</span>
                  {([
                    ['CLI', 'developer.cli', 'https://docs.kblabs.ru/reference/cli'],
                    ['SDK', 'developer.sdk', 'https://docs.kblabs.ru/sdk'],
                    ['REST API', 'developer.restApi', 'https://docs.kblabs.ru/reference/rest-api'],
                    ['Studio', 'developer.studio', 'https://docs.kblabs.ru/services/studio'],
                  ] as const).map(([icon, key, devHref]) => (
                    <a key={icon} className="megamenu-item" href={devHref} target="_blank" rel="noopener noreferrer">
                      <span className="megamenu-item-icon">{ICONS[icon]}</span>
                      <span>
                        <span className="megamenu-item-label">{t(`nav.megamenu.${key}.title`)}</span>
                        <span className="megamenu-item-desc">{t(`nav.megamenu.${key}.description`)}</span>
                      </span>
                    </a>
                  ))}
                  <a className="megamenu-item" href={lp('/marketplace')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1.5 3.5h11l-1 7H2.5l-1-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        <path d="M5 3.5V3a2 2 0 014 0v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.marketplace')}</span>
                    </span>
                  </a>
                  <div className="megamenu-cta">
                    <a href={lp('/enterprise')} className="megamenu-cta-link">{t('nav.megamenu.security.enterprise.title')} →</a>
                    <span>{t('nav.megamenu.security.enterprise.description')}</span>
                  </div>
                </div>
              </div>

              {/* ── Solutions panel ── */}
              <div className={`megamenu-panel${activeMenu === 'solutions' ? ' megamenu-panel--active' : ''}`} style={{ '--menu-cols': '1fr 1fr' } as React.CSSProperties}>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.solutions.automationLabel')}</span>
                  {([
                    ['Release Automation', 'solutions.releaseAutomation', '/solutions/release-automation'],
                    ['Code Quality', 'solutions.codeQuality', '/solutions/code-quality'],
                    ['Mind RAG', 'solutions.codeIntelligence', '/solutions/code-intelligence'],
                    ['Monorepo Ops', 'solutions.monorepoOps', '/solutions/monorepo-ops'],
                  ] as const).map(([icon, key, href]) => (
                    <a key={icon} className="megamenu-item" href={lp(href)}>
                      <span className="megamenu-item-icon">{ICONS[icon]}</span>
                      <span>
                        <span className="megamenu-item-label">{t(`nav.megamenu.${key}.title`)}</span>
                        <span className="megamenu-item-desc">{t(`nav.megamenu.${key}.description`)}</span>
                      </span>
                    </a>
                  ))}
                </div>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.solutions.infraLabel')}</span>
                  {([
                    ['Gateway', 'solutions.aiGateway', '/solutions/gateway'],
                    ['Platform API', 'solutions.platformApi', '/solutions/platform-api'],
                    ['Observability', 'solutions.observability', '/solutions/observability'],
                    ['kb-dev', 'solutions.kbDev', '/kb-dev'],
                    ['kb-devkit', 'solutions.kbDevkit', '/kb-devkit'],
                  ] as const).map(([icon, key, href]) => (
                    <a key={icon} className="megamenu-item" href={lp(href)}>
                      <span className="megamenu-item-icon">{ICONS[icon]}</span>
                      <span>
                        <span className="megamenu-item-label">{t(`nav.megamenu.${key}.title`)}</span>
                        <span className="megamenu-item-desc">{t(`nav.megamenu.${key}.description`)}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* ── Resources panel ── */}
              <div className={`megamenu-panel${activeMenu === 'resources' ? ' megamenu-panel--active' : ''}`} style={{ '--menu-cols': '1.15fr 1fr 1fr' } as React.CSSProperties}>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.learn.label')}</span>
                  <a className="megamenu-item" href={lp('/install')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 2v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <path d="M4.5 5.8L7 8.3l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <rect x="2" y="9.5" width="10" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.install.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.install.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href="https://docs.kblabs.ru" target="_blank" rel="noopener noreferrer">
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 2.5h10M2 5.5h7M2 8.5h8M2 11.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.docs.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.docs.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href={lp('/blog')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M4 5h6M4 7.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.blog.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.blog.description')}</span>
                    </span>
                  </a>
                  <Link className="megamenu-item" href={lp('/changelog')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.changelog.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.changelog.description')}</span>
                    </span>
                  </Link>
                  <Link className="megamenu-item" href={lp('/use-cases')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.useCases.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.useCases.description')}</span>
                    </span>
                  </Link>
                  <Link className="megamenu-item" href={lp('/roadmap')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 3h3l1.5 2L8 3h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 7h4l1.5 2L9 7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 11h5l1.5-2L10 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.learn.roadmap.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.learn.roadmap.description')}</span>
                    </span>
                  </Link>
                </div>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.company.label')}</span>
                  <a className="megamenu-item" href={lp('/about')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.company.about.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.company.about.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href={lp('/contact')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1.5" y="3.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M1.5 5.5l5.5 3.5 5.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.company.contact.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.company.contact.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href={lp('/security')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1.5L2 3.5V7c0 2.8 2 4.8 5 5.5 3-.7 5-2.7 5-5.5V3.5L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.company.security.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.company.security.description')}</span>
                    </span>
                  </a>
                  <Link className="megamenu-item" href={lp('/compare')}>
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="8" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M6 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.company.compare.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.company.compare.description')}</span>
                    </span>
                  </Link>
                </div>
                <div className="megamenu-col">
                  <span className="megamenu-heading">{t('nav.megamenu.community.label')}</span>
                  <a className="megamenu-item" href="https://github.com/KirillBaranov/kb-labs" target="_blank" rel="noopener noreferrer">
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1a6 6 0 00-1.897 11.693c.3.055.41-.13.41-.288l-.008-1.12c-1.67.363-2.02-.713-2.02-.713-.273-.693-.666--.878-.666-.878-.545-.372.041-.365.041-.365.602.043.92.619.92.619.534.917 1.402.652 1.744.499.054-.388.21-.652.38-.802-1.332-.152-2.733-.666-2.733-2.965 0-.655.234-1.19.617-1.61-.062-.151-.267-.76.059-1.584 0 0 .503-.161 1.648.614A5.74 5.74 0 017 4.82a5.74 5.74 0 011.502.202c1.144-.775 1.647-.614 1.647-.614.326.824.121 1.433.06 1.584.383.42.616.955.616 1.61 0 2.306-1.404 2.812-2.74 2.96.216.186.408.551.408 1.111l-.006 1.647c0 .16.108.347.413.288A6 6 0 007 1z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.community.github.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.community.github.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href="https://twitter.com/kblabs_dev" target="_blank" rel="noopener noreferrer">
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1.5l4.75 6.3L1 12.5h1.5l3.6-3.9 2.9 3.9H13L8 5.9 12.6 1.5h-1.5L7.3 5.1 4.5 1.5H1z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.community.twitter.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.community.twitter.description')}</span>
                    </span>
                  </a>
                  <a className="megamenu-item" href="https://discord.gg/kblabs" target="_blank" rel="noopener noreferrer">
                    <span className="megamenu-item-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M11.5 2.5A10.8 10.8 0 009 1.8a7.4 7.4 0 00-.33.68 10 10 0 00-3.34 0A7.4 7.4 0 005 1.8a10.8 10.8 0 00-2.5.7C.9 4.8.55 7 .72 9.17a10.9 10.9 0 003.34 1.69 8.3 8.3 0 00.72-1.17 7.1 7.1 0 01-1.13-.54l.27-.2a7.8 7.8 0 006.6 0l.27.2a7.1 7.1 0 01-1.14.55 8.3 8.3 0 00.72 1.16 10.9 10.9 0 003.34-1.69c.2-2.5-.34-4.67-1.25-6.67zM4.93 7.9c-.72 0-1.31-.66-1.31-1.47s.57-1.47 1.31-1.47c.74 0 1.33.66 1.32 1.47 0 .81-.58 1.47-1.32 1.47zm4.14 0c-.72 0-1.31-.66-1.31-1.47s.57-1.47 1.31-1.47c.74 0 1.33.66 1.32 1.47 0 .81-.57 1.47-1.32 1.47z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span>
                      <span className="megamenu-item-label">{t('nav.megamenu.community.discord.title')}</span>
                      <span className="megamenu-item-desc">{t('nav.megamenu.community.discord.description')}</span>
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </nav>
        </div>
        <div className="nav-actions">
          <LanguageSwitcher />
          <button className="nav-btn ai-ask" onClick={() => setAiOpen(true)} aria-label="Ask AI">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 4.5L14.5 7.5l-4.5 2L8 14l-2-4.5L1.5 7.5l4.5-2z" fill="currentColor"/></svg>
          </button>
          <Link className="nav-btn ghost" href={lp('/signup')}>{t('nav.login')}</Link>
          <Link className="nav-btn solid" href={lp('/install')}>{t('nav.start')}</Link>
        </div>
        {/* Mobile right: Install CTA + Burger (mobile only) */}
        <div className="nav-mobile-right">
          <Link className="nav-btn solid" href={lp('/install')}>{t('nav.start')}</Link>
          <button className="nav-burger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            <span className={`burger-line${mobileOpen ? ' burger-open' : ''}`} />
            <span className={`burger-line${mobileOpen ? ' burger-open' : ''}`} />
            <span className={`burger-line${mobileOpen ? ' burger-open' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu overlay — portal to body for correct stacking */}
      {mounted && <>{createPortal(
        <div className={`nav-mobile${mobileOpen ? ' nav-mobile--open' : ''}`}>
          <div className="nav-mobile-scroll">
            {NAV_DROPDOWNS.map((dropdown) => (
              <MobileSection key={dropdown.menuId} label={t(dropdown.labelKey)}>
                {dropdown.sections.map((section) => (
                  <div key={section.headingKey || 'default'}>
                    {section.headingKey && <span className="mob-heading">{t(section.headingKey)}</span>}
                    {section.items.map((item) => (
                      <a
                        key={item.key}
                        className="mob-link"
                        href={item.external ? item.href : lp(item.href)}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        onClick={closeMobile}
                      >
                        {t(`nav.megamenu.${item.key}.title`)}
                      </a>
                    ))}
                  </div>
                ))}
                {/* Extra items (e.g. Marketplace in Product) */}
                {dropdown.menuId === 'product' && MOBILE_EXTRA_PRODUCT_ITEMS.map((item) => (
                  <a key={item.key} className="mob-link" href={lp(item.href)} onClick={closeMobile}>
                    {t(`nav.${item.key}`)}
                  </a>
                ))}
              </MobileSection>
            ))}

            {NAV_LINKS.map((link) => (
              link.external ? (
                <a key={link.labelKey} className="mob-plain-link" href={link.href} target="_blank" rel="noopener noreferrer" onClick={closeMobile}>
                  {t(link.labelKey)}
                </a>
              ) : (
                <Link key={link.labelKey} className="mob-plain-link" href={lp(link.href)} onClick={closeMobile}>
                  {t(link.labelKey)}
                </Link>
              )
            ))}
          </div>

          <div className="nav-mobile-bottom">
            <LanguageSwitcher />
            <div className="nav-mobile-ctas">
              <Link className="nav-btn ghost" href={lp('/signup')} onClick={closeMobile}>{t('nav.login')}</Link>
              <Link className="nav-btn solid" href={lp('/install')} onClick={closeMobile}>{t('nav.start')}</Link>
            </div>
          </div>
        </div>,
        document.body,
      )}</>}

      <AiAssistant open={aiOpen} onClose={() => setAiOpen(false)} locale={locale} />
    </header>
  );
}
