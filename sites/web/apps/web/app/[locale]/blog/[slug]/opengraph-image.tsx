import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@kb-labs/web-og';
import { POSTS } from './page';

export const alt = 'KB Labs Blog Post';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const post = POSTS[slug];

  if (!post) {
    return renderOgImage({
      title: 'KB Labs Blog',
      description: 'Engineering notes, platform updates, and thinking out loud.',
      badge: 'Blog',
    });
  }

  return renderOgImage({
    title: post.title,
    description: `${post.tag} • ${post.date} • ${post.readTime}`,
    badge: 'Blog',
  });
}
