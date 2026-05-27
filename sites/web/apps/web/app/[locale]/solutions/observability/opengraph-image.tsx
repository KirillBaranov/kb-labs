import { getTranslations } from 'next-intl/server';
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';

export const alt = 'KB Labs — Observability';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'solutionObservability' });
  return renderOgImage({
    title: t('page.meta.title'),
    description: t('page.meta.description'),
    badge: 'Solutions',
  });
}
