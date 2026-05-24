import * as React from 'react';
import { cn } from '../../lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<AlertVariant, string> = {
  info:    'bg-accent/[0.08] border-accent/25 text-accent',
  success: 'bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/[0.08] border-amber-500/25 text-amber-700 dark:text-amber-400',
  danger:  'bg-destructive/[0.08] border-destructive/25 text-destructive',
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', title, children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-lg border px-4 py-3 text-sm leading-relaxed', styles[variant], className)}
    >
      {title && <p className="m-0 mb-0.5 font-semibold">{title}</p>}
      {children && <p className="m-0 opacity-90">{children}</p>}
    </div>
  );
}
