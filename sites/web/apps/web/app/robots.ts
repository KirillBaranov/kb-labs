import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/demo', '/signup', '/api/'],
      },
    ],
    sitemap: 'https://kblabs.ru/sitemap.xml',
    host: 'https://kblabs.ru',
  };
}
