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
  'kb-deploy': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M4 5l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="2" y="10.5" width="10" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  'kb-monitor': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3 7l2-2 2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 12.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Marketplace: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 3.5h11l-1 7H2.5l-1-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 3.5V3a2 2 0 014 0v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Docs: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1.5h7l3 3v8a.5.5 0 01-.5.5h-9.5a.5.5 0 01-.5-.5v-10.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M9 1.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M4.5 7.5h5M4.5 10h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Blog: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 5h6M4 7.5h6M4 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  'Use Cases': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  Compare: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Roadmap: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="11" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.2 3.8c2 1 4.5 1.5 5.5 2.5M9.7 8.2c-2 1-4.5 1.5-5.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Changelog: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Security: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L2 3.5V7c0 2.8 2 4.8 5 5.5 3-.7 5-2.7 5-5.5V3.5L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 7l1.5 1.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  About: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
            {/* Desktop nav triggers — rendered from nav-config */}
            {NAV_DROPDOWNS.map((dropdown) => (
              <div
                key={dropdown.menuId}
                className="nav-mega-wrap"
                onMouseEnter={() => handleEnter(dropdown.menuId)}
              >
                <button className="nav-link nav-mega-trigger" aria-expanded={isOpen(dropdown.menuId)}>
                  {t(dropdown.labelKey)}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Top-level links (no dropdown) */}
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.labelKey}
                  className="nav-link"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(link.labelKey)}
                </a>
              ) : (
                <Link
                  key={link.labelKey}
                  className={`nav-link${isActive(link.href) ? ' active' : ''}`}
                  href={lp(link.href)}
                >
                  {t(link.labelKey)}
                </Link>
              ),
            )}

            {/* Single shared megamenu container — panels rendered from nav-config */}
            <div
              className={`megamenu${activeMenu ? ' megamenu--open' : ''}`}
              data-slide={slideDir}
              onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}
            >
              {NAV_DROPDOWNS.map((dropdown) => (
                <div
                  key={dropdown.menuId}
                  className={`megamenu-panel${activeMenu === dropdown.menuId ? ' megamenu-panel--active' : ''}`}
                  style={{ '--menu-cols': dropdown.cols } as React.CSSProperties}
                >
                  {dropdown.sections.map((section, sectionIndex) => (
                    <div key={section.headingKey || `section-${sectionIndex}`} className="megamenu-col">
                      {section.headingKey && (
                        <span className="megamenu-heading">{t(section.headingKey)}</span>
                      )}
                      {section.items.map((item) => {
                        const iconNode = item.icon ? ICONS[item.icon] : null;
                        const labelText = t(`nav.megamenu.${item.key}.title`);
                        const descText = t(`nav.megamenu.${item.key}.description`);
                        const content = (
                          <>
                            {iconNode && <span className="megamenu-item-icon">{iconNode}</span>}
                            <span>
                              <span className="megamenu-item-label">{labelText}</span>
                              <span className="megamenu-item-desc">{descText}</span>
                            </span>
                          </>
                        );
                        if (item.external) {
                          return (
                            <a
                              key={item.key}
                              className="megamenu-item"
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {content}
                            </a>
                          );
                        }
                        return (
                          <a key={item.key} className="megamenu-item" href={lp(item.href)}>
                            {content}
                          </a>
                        );
                      })}
                    </div>
                  ))}
                  {dropdown.cta && (
                    <div className="megamenu-cta">
                      <a href={lp(dropdown.cta.href)} className="megamenu-cta-link">
                        {t(dropdown.cta.labelKey)} →
                      </a>
                      {dropdown.cta.descKey && <span>{t(dropdown.cta.descKey)}</span>}
                    </div>
                  )}
                </div>
              ))}
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
