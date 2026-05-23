import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full min-w-0 rounded-md border bg-surface px-4 py-[0.65rem]',
          'text-[0.97rem] text-kb-text placeholder:text-muted/60',
          'font-inherit outline-none transition-[border-color,box-shadow] duration-150',
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

Input.displayName = 'Input';
