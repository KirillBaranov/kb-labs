import { getTranslations } from 'next-intl/server';
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';

export const alt = 'KB Labs Blog';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return renderOgImage({
    title: t('blog.hero.title'),
    description: t('blog.hero.subtitle'),
    badge: 'Blog',
  });
}
