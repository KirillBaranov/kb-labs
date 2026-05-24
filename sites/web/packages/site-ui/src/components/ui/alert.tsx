import * as React from 'react';
import { cn } from '../../lib/utils';

type AlertVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

const variantStyles: Record<AlertVariant, string> = {
  default:  'border-line bg-surface text-kb-text',
  success:  'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning:  'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger:   'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  info:     'border-accent/30 bg-accent/10 text-accent',
};

export function Alert({ variant = 'default', title, className, children }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        variantStyles[variant],
        className
      )}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
