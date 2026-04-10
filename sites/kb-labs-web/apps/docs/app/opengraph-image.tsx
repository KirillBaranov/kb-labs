import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';

export const alt = 'KB Labs Documentation';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage() {
  return renderOgImage({
    title: 'KB Labs Documentation',
    description:
      'Plugin-first engineering automation platform — guides, references, and architecture.',
    badge: 'Docs',
    url: 'docs.kblabs.ru',
  });
}
