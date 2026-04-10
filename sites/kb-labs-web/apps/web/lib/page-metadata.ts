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
   * Optional override for the OG image. By default, the closest matching
   * `opengraph-image.tsx` route is used (Next.js convention) — but only when the
   * **same segment** ships one. To make every page fall back to the global
   * landing-page image, this helper forces an explicit absolute image URL
   * pointing at `<SITE_URL>/<locale>/opengraph-image`. Pages that ship their
   * own `opengraph-image.tsx` should pass `imageSegment: '<segment>'` so the
   * helper points to that segment's image instead (e.g. `'blog'`, `'marketplace'`).
   */
  imageSegment?: string;
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
 *
 * Result: every page that goes through this helper renders rich social cards.
 */
export function buildPageMetadata(options: PageMetadataOptions): Metadata {
  const { locale, title, description, path = '', imageSegment } = options;

  const canonical = `${SITE_URL}/${locale}${path}`;
  const ogImagePath = imageSegment ? `/${locale}/${imageSegment}/opengraph-image` : `/${locale}/opengraph-image`;
  const ogImageUrl = `${SITE_URL}${ogImagePath}`;

  return {
    title,
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
      },
    },
  };
}
