import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ProseProps {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Prose({ children, className, size = 'md' }: ProseProps) {
  return (
    <div
      className={cn(
        'text-kb-text',
        size === 'sm' && 'text-[0.9rem]',
        size === 'md' && 'text-[1rem]',
        size === 'lg' && 'text-[1.05rem]',
        // headings
        '[&_h1]:m-0 [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:text-[2rem] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h1]:text-kb-text first:[&_h1]:mt-0',
        '[&_h2]:m-0 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-[1.4rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:tracking-tight [&_h2]:text-kb-text',
        '[&_h3]:m-0 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[1.15rem] [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-kb-text',
        '[&_h4]:m-0 [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-[1rem] [&_h4]:font-semibold [&_h4]:text-kb-text',
        // paragraphs
        '[&_p]:m-0 [&_p]:mb-4 [&_p]:leading-[1.75] [&_p]:text-muted last:[&_p]:mb-0',
        // links
        '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-accent/40 [&_a:hover]:decoration-accent [&_a]:transition-[text-decoration-color]',
        // lists
        '[&_ul]:m-0 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted',
        '[&_ol]:m-0 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-muted',
        '[&_li]:mb-1.5 [&_li]:leading-relaxed',
        '[&_li>p]:mb-0',
        // blockquote
        '[&_blockquote]:m-0 [&_blockquote]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted',
        // inline code
        '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:border [&_:not(pre)>code]:border-line-strong [&_:not(pre)>code]:bg-bg [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] [&_:not(pre)>code]:text-accent',
        // code blocks
        '[&_pre]:m-0 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-line-strong [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed',
        // hr
        '[&_hr]:m-0 [&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line',
        // strong / em
        '[&_strong]:font-semibold [&_strong]:text-kb-text',
        '[&_em]:italic',
        // table
        '[&_table]:m-0 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border [&_th]:border-line [&_th]:bg-bg [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-kb-text',
        '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:text-muted',
        className
      )}
    >
      {children}
    </div>
  );
}
