import * as React from 'react';
import { cn } from '../../lib/utils';

export interface FormFieldProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, description, error, required, htmlFor, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium leading-none text-kb-text">
          {label}
          {required && <span className="ml-1 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {description && !error && (
        <p className="m-0 text-sm leading-snug text-muted">{description}</p>
      )}
      {error && (
        <p className="m-0 text-sm leading-snug text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
