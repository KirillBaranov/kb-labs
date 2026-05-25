import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';
import { getDocPage } from '@/lib/content';

export const alt = 'KB Labs Documentation';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}) {
  const { locale, slug } = await params;
  const resolvedSlug = slug ?? ['index'];
  const page = await getDocPage(locale, resolvedSlug);

  return renderOgImage({
    title: page?.frontmatter.title ?? 'KB Labs Documentation',
    description:
      page?.frontmatter.description ??
      'Plugin-first engineering automation platform — guides, references, and architecture.',
    badge: 'Docs',
    url: 'docs.kblabs.ru',
  });
}
