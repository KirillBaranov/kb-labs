import type { MetadataRoute } from 'next';
import { buildNavFromContent } from '@/nav.config';

const DOCS_URL = 'https://docs.kblabs.ru';

export default function sitemap(): MetadataRoute.Sitemap {
  const nav = buildNavFromContent('en');
  const entries: MetadataRoute.Sitemap = [];

  const allHrefs = nav.flatMap((group) => group.items.map((item) => item.href));

  for (const href of allHrefs) {
    const slugPath = href.replace(/^\/en/, '');

    entries.push({
      url: `${DOCS_URL}/ru${slugPath}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: {
        languages: {
          ru: `${DOCS_URL}/ru${slugPath}`,
          en: `${DOCS_URL}/en${slugPath}`,
          'x-default': `${DOCS_URL}${slugPath}`,
        },
      },
    });
  }

  return entries;
}
