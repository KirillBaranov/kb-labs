import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';
import { listBlogPosts } from '@/lib/content';

export const alt = 'KB Labs Blog Post';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const posts = listBlogPosts('en');
  const post = posts.find((p) => p.slug === slug);

  if (!post) {
    return renderOgImage({
      title: 'KB Labs Blog',
      description: 'Engineering notes, platform updates, and thinking out loud.',
      badge: 'Blog',
    });
  }

  const { frontmatter: fm } = post;

  return renderOgImage({
    title: fm.title,
    description: fm.excerpt ?? fm.description,
    badge: fm.tag ?? 'Blog',
  });
}
