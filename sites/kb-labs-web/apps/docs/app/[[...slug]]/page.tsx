import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { DocsLayout } from '@/components/DocsLayout';
import { getDocPage, extractHeadings } from '@/lib/content';

type Props = {
  params: Promise<{ slug?: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length === 0) return {};
  const doc = await getDocPage(slug);
  if (!doc) return {};
  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;

  // Root "/" → redirect to introduction
  if (!slug || slug.length === 0) {
    redirect('/quick-start');
  }

  const doc = await getDocPage(slug);
  if (!doc) notFound();

  const toc = extractHeadings(slug);

  return (
    <DocsLayout toc={toc} slug={slug} pageTitle={doc.frontmatter.title} pageDescription={doc.frontmatter.description} pageUpdatedAt={doc.frontmatter.updatedAt}>
      {doc.content}
    </DocsLayout>
  );
}
