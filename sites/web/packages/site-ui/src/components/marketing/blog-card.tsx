import * as React from 'react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';

export interface BlogCardProps {
  title: string;
  excerpt?: string;
  date: string;
  href: string;
  tags?: string[];
  author?: string;
  readTime?: string;
  coverImage?: string;
  featured?: boolean;
  className?: string;
}

export function BlogCard({
  title,
  excerpt,
  date,
  href,
  tags,
  author,
  readTime,
  coverImage,
  featured = false,
  className,
}: BlogCardProps) {
  return (
    <a
      href={href}
      className={cn(
        'group flex flex-col rounded-xl border border-line-strong bg-surface',
        'overflow-hidden transition-all duration-200',
        'hover:border-accent/40 hover:shadow-card-lg',
        featured && 'md:flex-row',
        className
      )}
    >
      {coverImage && (
        <div
          className={cn(
            'shrink-0 overflow-hidden bg-bg',
            featured ? 'md:w-[45%]' : 'aspect-[16/9] w-full'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="muted" className="text-[0.7rem]">{tag}</Badge>
            ))}
          </div>
        )}

        <h3 className="m-0 text-[1.05rem] font-semibold leading-snug tracking-tight text-kb-text transition-colors group-hover:text-accent">
          {title}
        </h3>

        {excerpt && (
          <p className="m-0 line-clamp-2 text-[0.9rem] leading-relaxed text-muted">{excerpt}</p>
        )}

        <div className="mt-auto flex items-center gap-3 pt-2 text-[0.78rem] text-muted/70">
          <time>{date}</time>
          {readTime && <span>·</span>}
          {readTime && <span>{readTime}</span>}
          {author && <span>·</span>}
          {author && <span>{author}</span>}
        </div>
      </div>
    </a>
  );
}
