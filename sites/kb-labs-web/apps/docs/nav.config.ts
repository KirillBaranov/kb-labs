import { buildNavFromContent } from '@/lib/nav-loader';

export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * Navigation is generated from the `content/` directory at build time.
 *
 * To customize:
 *   - Page order / label: set `order` and `title` in MDX frontmatter.
 *   - Group title / order: drop a `_meta.json` in the directory:
 *       { "title": "Plugin Development", "order": 30 }
 *   - Hide a page: set `hidden: true` in frontmatter or `_meta.json`.
 */
export const NAV: NavGroup[] = buildNavFromContent();
