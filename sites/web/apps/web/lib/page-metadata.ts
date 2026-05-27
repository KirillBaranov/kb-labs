import type { Metadata } from 'next';

const SITE_URL = 'https://kblabs.ru';
const SITE_NAME = 'KB Labs';

interface PageMetadataOptions {
  /** Active locale (e.g. "en", "ru"). */
  locale: string;
  /** Page title — used for <title>, og:title, twitter:title. */
  title: string;
  /** Page description — used for <meta description>, og:description, twitter:description. */
  description: string;
  /**
   * Path of this page relative to the locale, with leading slash but no locale prefix.
   * For the home page pass `''`.
   * Examples: `''`, `/contact`, `/blog`, `/blog/open-the-closed`.
   */
  path?: string;
  /**
   * Required. Segment path (relative to `[locale]/`) where this page's
   * `opengraph-image.tsx` lives — e.g. `'blog'`, `'product/kb-dev'`.
   * Pass `'default'` only to explicitly fall back to the global landing-page
   * OG image (pages excluded from search indexing such as /demo, /signup, legal).
   *
   * Every indexed page must ship its own `opengraph-image.tsx`; passing anything
   * other than `'default'` without that file is an error caught by `seo-check`.
   */
  imageSegment: string;
}

/**
 * Build a Next.js `Metadata` object with full Open Graph + Twitter coverage,
 * including a guaranteed `og:image` and `twitter:card='summary_large_image'`.
 *
 * Why this helper exists:
 *   - Next.js does **not** inherit `opengraph-image.tsx` across segments — it
 *     only applies to the segment that owns the file.
 *   - Page-level `openGraph` / `twitter` in `generateMetadata` fully replaces
 *     the parent layout's fields (no deep merge for `card`, `images`, etc.).
 *   - `title: { absolute }` bypasses the root layout template (`%s — KB Labs`)
 *     so that the full branded title stored in messages is used as-is and
 *     `<title>` stays in sync with `og:title`.
 *
 * Result: every page that goes through this helper renders rich social cards.
 */
export function buildPageMetadata(options: PageMetadataOptions): Metadata {
  const { locale, title, description, path = '', imageSegment } = options;

  const canonical = `${SITE_URL}/${locale}${path}`;
  const ogImagePath = imageSegment !== 'default'
    ? `/${locale}/${imageSegment}/opengraph-image`
    : `/${locale}/opengraph-image`;
  const ogImageUrl = `${SITE_URL}${ogImagePath}`;

  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical,
      languages: {
        ru: `${SITE_URL}/ru${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}/en${path}`,
      },
    },
  };
}
