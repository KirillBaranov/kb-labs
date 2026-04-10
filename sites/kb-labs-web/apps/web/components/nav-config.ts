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
        headingKey: 'nav.megamenu.engine.label',
        items: [
          { key: 'platform.workflows', href: '/product/workflows', icon: 'Workflows' },
          { key: 'platform.plugins', href: '/product/plugins', icon: 'Plugin System' },
          { key: 'platform.stateBroker', href: '/product/state-broker', icon: 'State Broker' },
        ],
      },
      {
        headingKey: 'nav.megamenu.developer.label',
        items: [
          { key: 'developer.cli', href: 'https://docs.kblabs.ru/reference/cli', icon: 'CLI', external: true },
          { key: 'developer.sdk', href: 'https://docs.kblabs.ru/sdk', icon: 'SDK', external: true },
          { key: 'developer.restApi', href: 'https://docs.kblabs.ru/reference/rest-api', icon: 'REST API', external: true },
          { key: 'developer.studio', href: 'https://docs.kblabs.ru/services/studio', icon: 'Studio', external: true },
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
        headingKey: 'nav.megamenu.solutions.automationLabel',
        items: [
          { key: 'solutions.releaseAutomation', href: '/solutions/release-automation', icon: 'Release Automation' },
          { key: 'solutions.codeQuality', href: '/solutions/code-quality', icon: 'Code Quality' },
          { key: 'solutions.codeIntelligence', href: '/solutions/code-intelligence', icon: 'Mind RAG' },
          { key: 'solutions.monorepoOps', href: '/solutions/monorepo-ops', icon: 'Monorepo Ops' },
        ],
      },
      {
        headingKey: 'nav.megamenu.solutions.infraLabel',
        items: [
          { key: 'solutions.aiGateway', href: '/solutions/gateway', icon: 'Gateway' },
          { key: 'solutions.platformApi', href: '/solutions/platform-api', icon: 'Platform API' },
          { key: 'solutions.observability', href: '/solutions/observability', icon: 'Observability' },
        ],
      },
    ],
  },
  {
    labelKey: 'nav.resources',
    menuId: 'resources',
    cols: '1.15fr 1fr 1fr',
    sections: [
      {
        headingKey: 'nav.megamenu.learn.label',
        items: [
          { key: 'learn.install', href: '/install' },
          { key: 'learn.docs', href: 'https://docs.kblabs.ru', external: true },
          { key: 'learn.blog', href: '/blog' },
          { key: 'learn.changelog', href: '/changelog' },
          { key: 'learn.useCases', href: '/use-cases' },
          { key: 'learn.roadmap', href: '/roadmap' },
        ],
      },
      {
        headingKey: 'nav.megamenu.company.label',
        items: [
          { key: 'company.about', href: '/about' },
          { key: 'company.contact', href: '/contact' },
          { key: 'company.security', href: '/security' },
          { key: 'company.compare', href: '/compare' },
        ],
      },
      {
        headingKey: 'nav.megamenu.community.label',
        items: [
          { key: 'community.github', href: 'https://github.com/KirillBaranov/kb-labs', external: true },
          { key: 'community.twitter', href: 'https://twitter.com/kblabs_dev', external: true },
          { key: 'community.discord', href: 'https://discord.gg/kblabs', external: true },
        ],
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   Standalone links (no dropdown)
   ═══════════════════════════════════════════════════════════════════ */

export const NAV_LINKS: NavLink[] = [
  { labelKey: 'nav.docs', href: 'https://docs.kblabs.ru', external: true },
  { labelKey: 'nav.pricing', href: '/pricing' },
];

/* ═══════════════════════════════════════════════════════════════════
   Extra items only in mobile menu (marketplace link in Product)
   ═══════════════════════════════════════════════════════════════════ */

export const MOBILE_EXTRA_PRODUCT_ITEMS: NavItem[] = [
  { key: 'marketplace', href: '/marketplace' },
];

/* Menu order for slide direction calculation */
export const MENU_ORDER = NAV_DROPDOWNS.map((d) => d.menuId);
