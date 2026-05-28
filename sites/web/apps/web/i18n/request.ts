import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { routing } from './routing';

/**
 * Resolve the page-specific message chunk for a given pathname.
 *
 * Convention: URL path X → messages/<locale>/X.json
 * Greedy fallback: /product/kb-dev → tries product/kb-dev → tries product → {}
 *
 * Dynamic segments ([slug], [id], etc.) are already excluded from static pages
 * — if no chunk file exists the function silently returns {}.
 */
async function resolvePageChunk(
  pathname: string,
  locale: string,
): Promise<Record<string, unknown>> {
  // Strip locale prefix: /en/pricing → pricing, /ru/product/kb-dev → product/kb-dev
  const stripped = pathname.replace(/^\/(en|ru)(\/|$)/, '').replace(/\/$/, '');

  // Next.js special file routes are not real path segments — strip them so that
  // e.g. /ru/opengraph-image resolves the same chunk as /ru/ (home),
  // and /ru/compare/opengraph-image resolves the same chunk as /ru/compare.
  const VIRTUAL_SEGMENTS = new Set(['opengraph-image', 'twitter-image', 'icon', 'sitemap', 'robots']);
  const segments = stripped.split('/').filter((s) => Boolean(s) && !VIRTUAL_SEGMENTS.has(s));

  if (segments.length === 0) {
    // Root path (or root opengraph-image): load home chunk
    segments.push('home');
  }

  // Try from deepest to shallowest
  for (let depth = segments.length; depth > 0; depth--) {
    const candidate = segments.slice(0, depth).join('/');
    try {
      // Dynamic import — Next.js bundles these at build time
      const mod = await import(`../messages/${locale}/${candidate}.json`);
      return mod.default as Record<string, unknown>;
    } catch {
      // No chunk for this path segment — try shorter
    }
  }

  return {};
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as 'ru' | 'en')) {
    locale = routing.defaultLocale;
  }

  // x-pathname is injected by middleware.ts
  const pathname = (await headers()).get('x-pathname') ?? `/${locale}`;

  const [shared, page] = await Promise.all([
    import(`../messages/${locale}/_shared.json`)
      .then((m) => m.default as Record<string, unknown>)
      .catch(() => ({} as Record<string, unknown>)),
    resolvePageChunk(pathname, locale),
  ]);

  return {
    locale,
    messages: { ...shared, ...page },
  };
});
