/*
 * Navigation config — single source of truth for both desktop megamenu and mobile accordion.
 * Add/remove items here — SiteHeader renders them automatically.
 */

export interface NavItem {
  /** i18n key for megamenu title, e.g. 'platform.workflows' → t(`nav.megamenu.${key}.title`) */
  key: string;
  /** Internal path (prefixed with locale) or external URL */
  href: string;
  /** Icon key from ICONS map in SiteHeader (desktop only) */
  icon?: string;
  /** External link (opens in new tab) */
  external?: boolean;
}

export interface NavSection {
  /** i18n key for section heading, e.g. 'nav.megamenu.platform.label' */
  headingKey?: string;
  items: NavItem[];
}

export interface NavDropdown {
  /** i18n key for nav button label, e.g. 'nav.product' */
  labelKey: string;
  /** Menu ID for megamenu state */
  menuId: string;
  /** Megamenu column layout CSS value */
  cols: string;
  /** Sections within this dropdown */
  sections: NavSection[];
  /** Extra element after sections (e.g. enterprise CTA) */
  cta?: { labelKey: string; href: string; descKey?: string };
}

export interface NavLink {
  labelKey: string;
  href: string;
  external?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Dropdown menus (Product, Solutions, Resources)
   ═══════════════════════════════════════════════════════════════════ */

export const NAV_DROPDOWNS: NavDropdown[] = [
  {
    labelKey: 'nav.product',
    menuId: 'product',
    cols: '1fr 1fr',
    sections: [
      {
        headingKey: 'nav.megamenu.core.label',
        items: [
          { key: 'product.workflows', href: '/product/workflows', icon: 'Workflows' },
          { key: 'product.plugins', href: '/product/plugins', icon: 'Plugin System' },
          { key: 'product.gateway', href: '/solutions/gateway', icon: 'Gateway' },
          { key: 'product.stateBroker', href: '/product/state-broker', icon: 'State Broker' },
          { key: 'product.studio', href: '/product/studio', icon: 'Studio' },
        ],
      },
      {
        headingKey: 'nav.megamenu.tools.label',
        items: [
          { key: 'tools.kbDev', href: '/kb-dev', icon: 'kb-dev' },
          { key: 'tools.kbDevkit', href: '/kb-devkit', icon: 'kb-devkit' },
          { key: 'tools.kbDeploy', href: '/kb-deploy', icon: 'kb-deploy' },
          { key: 'tools.kbMonitor', href: '/kb-monitor', icon: 'kb-monitor' },
          { key: 'tools.marketplace', href: '/marketplace', icon: 'Marketplace' },
        ],
      },
    ],
  },
  {
    labelKey: 'nav.solutions',
    menuId: 'solutions',
    cols: '1fr 1fr',
    sections: [
      {
        headingKey: 'nav.megamenu.delivery.label',
        items: [
          { key: 'solutions.releaseAutomation', href: '/solutions/release-automation', icon: 'Release Automation' },
          { key: 'solutions.codeQuality', href: '/solutions/code-quality', icon: 'Code Quality' },
          { key: 'solutions.codeIntelligence', href: '/solutions/code-intelligence', icon: 'Mind RAG' },
        ],
      },
      {
        headingKey: 'nav.megamenu.platformOps.label',
        items: [
          { key: 'solutions.monorepoOps', href: '/solutions/monorepo-ops', icon: 'Monorepo Ops' },
          { key: 'solutions.observability', href: '/solutions/observability', icon: 'Observability' },
          { key: 'solutions.platformApi', href: '/solutions/platform-api', icon: 'Platform API' },
        ],
      },
    ],
  },
  {
    labelKey: 'nav.resources',
    menuId: 'resources',
    cols: '1fr 1fr',
    sections: [
      {
        headingKey: 'nav.megamenu.learn.label',
        items: [
          { key: 'learn.docs', href: 'https://docs.kblabs.ru', external: true, icon: 'Docs' },
          { key: 'learn.blog', href: '/blog', icon: 'Blog' },
          { key: 'learn.useCases', href: '/use-cases', icon: 'Use Cases' },
          { key: 'learn.compare', href: '/compare', icon: 'Compare' },
        ],
      },
      {
        headingKey: 'nav.megamenu.project.label',
        items: [
          { key: 'project.roadmap', href: '/roadmap', icon: 'Roadmap' },
          { key: 'project.changelog', href: '/changelog', icon: 'Changelog' },
          { key: 'project.security', href: '/security', icon: 'Security' },
          { key: 'project.about', href: '/about', icon: 'About' },
        ],
      },
    ],
    cta: {
      labelKey: 'nav.megamenu.enterprise.title',
      href: '/enterprise',
      descKey: 'nav.megamenu.enterprise.description',
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════
   Standalone links (no dropdown)
   ═══════════════════════════════════════════════════════════════════ */

export const NAV_LINKS: NavLink[] = [
  { labelKey: 'nav.pricing', href: '/pricing' },
];

/* ═══════════════════════════════════════════════════════════════════
   Extra items only in mobile menu
   ═══════════════════════════════════════════════════════════════════ */

export const MOBILE_EXTRA_PRODUCT_ITEMS: NavItem[] = [];

/* Menu order for slide direction calculation */
export const MENU_ORDER = NAV_DROPDOWNS.map((d) => d.menuId);
