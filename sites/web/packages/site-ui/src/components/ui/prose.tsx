import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ProseProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Theme-aware prose container using CSS variables.
 * Use instead of Tailwind `prose`/`prose-invert` to avoid hardcoded dark/light colors.
 */
export function Prose({ className, children }: ProseProps) {
  return (
    <div
      className={cn(
        // Base typography
        'prose max-w-none',
        // Override prose colors to use CSS variables
        '[&_h1]:text-kb-text [&_h2]:text-kb-text [&_h3]:text-kb-text [&_h4]:text-kb-text',
        '[&_p]:text-muted [&_li]:text-muted [&_td]:text-muted [&_th]:text-kb-text',
        '[&_strong]:text-kb-text [&_em]:text-kb-text',
        '[&_a]:text-accent [&_a:hover]:underline',
        '[&_code]:text-kb-text [&_code]:bg-line [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5',
        '[&_pre]:bg-surface [&_pre]:border [&_pre]:border-line',
        '[&_blockquote]:border-l-accent [&_blockquote]:text-muted',
        '[&_hr]:border-line',
        '[&_table]:border-collapse',
        '[&_th]:border [&_th]:border-line [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2',
        '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2',
        className
      )}
    >
      {children}
    </div>
  );
}
