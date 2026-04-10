export const locales = ['ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';

/**
 * Generates alternates.languages for generateMetadata.
 * siteUrl is a parameter so both web (kblabs.ru) and docs can use this util.
 *
 * @example
 * alternates: getAlternateLinks(locale, '/install', 'https://kblabs.ru')
 */
export function getAlternateLinks(locale: Locale, pathname: string, siteUrl: string) {
  return {
    canonical: `${siteUrl}/${locale}${pathname}`,
    languages: Object.fromEntries(
      locales.map((l) => [l, `${siteUrl}/${l}${pathname}`])
    ) as Record<Locale, string>,
  };
}

/**
 * Builds a localised path for use in LanguageSwitcher links.
 * @example buildLocalePath('en', '/install') → '/en/install'
 */
export function buildLocalePath(locale: Locale, path: string): string {
  return `/${locale}${path}`;
}
