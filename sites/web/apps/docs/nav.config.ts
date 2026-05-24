import { buildNavFromContent } from '@/lib/nav-loader';

export type NavItem = {
  label: string;
  href: string;
  untranslated?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export { buildNavFromContent };
