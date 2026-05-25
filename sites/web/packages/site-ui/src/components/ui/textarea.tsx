import * as React from 'react';
import { cn } from '../../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full min-w-0 resize-y rounded-md border bg-surface px-4 py-[0.65rem]',
        'min-h-[100px] font-[inherit] text-[0.97rem] leading-relaxed text-kb-text',
        'placeholder:text-muted/60 outline-none ring-0',
        'transition-[border-color,box-shadow] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        error
          ? 'border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/20'
          : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/[0.12]',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
