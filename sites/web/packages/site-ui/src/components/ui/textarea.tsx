import * as React from 'react';
import { cn } from '../../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full min-w-0 rounded-md border bg-surface px-4 py-[0.65rem]',
          'text-[0.97rem] text-kb-text placeholder:text-muted/60',
          'font-[inherit] outline-none ring-0 transition-[border-color,box-shadow] duration-150',
          'resize-y min-h-[80px]',
          error
            ? 'border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/20'
            : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/[0.12]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
