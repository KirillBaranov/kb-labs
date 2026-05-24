import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TestimonialCardProps {
  quote: string;
  author: string;
  role?: string;
  company?: string;
  avatarUrl?: string;
  avatarFallback?: string;
  className?: string;
}

export function TestimonialCard({
  quote,
  author,
  role,
  company,
  avatarUrl,
  avatarFallback,
  className,
}: TestimonialCardProps) {
  const initials = avatarFallback ?? author.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <figure
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-line-strong bg-surface p-6',
        className
      )}
    >
      <svg
        className="size-6 shrink-0 text-accent/60"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
      </svg>

      <blockquote className="m-0 flex-1 text-[0.97rem] leading-relaxed text-kb-text">
        {quote}
      </blockquote>

      <figcaption className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg text-sm font-semibold text-muted overflow-hidden">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={author} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold leading-none text-kb-text">{author}</span>
          {(role || company) && (
            <span className="text-sm text-muted">
              {[role, company].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
