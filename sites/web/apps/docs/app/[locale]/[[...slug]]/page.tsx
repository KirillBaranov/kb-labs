import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { DocsLayout } from '@/components/DocsLayout';
import { getDocPage, extractHeadings } from '@/lib/content';

type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!slug || slug.length === 0) return {};
  const doc = await getDocPage(locale, slug);
  if (!doc) return {};
  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
  };
}

export default async function DocPage({ params }: Props) {
  const { locale, slug } = await params;

  if (!slug || slug.length === 0) {
    redirect(`/${locale}/quick-start`);
  }

  const doc = await getDocPage(locale, slug);
  if (!doc) notFound();

  const toc = extractHeadings(locale, slug);

  return (
    <DocsLayout
      locale={locale}
      toc={toc}
      slug={slug}
      isFallback={doc.isFallback}
      isIndex={doc.isIndex}
      pageTitle={doc.frontmatter.title}
      pageDescription={doc.frontmatter.description}
      pageUpdatedAt={doc.frontmatter.updatedAt}
    >
      {doc.content}
    </DocsLayout>
  );
}
