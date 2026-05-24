import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold border',
  {
    variants: {
      variant: {
        default: 'bg-bg text-muted border-line',
        accent:  'bg-accent/10 text-accent border-accent/20',
        muted:   'bg-muted/10 text-muted border-muted/20',
        success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        warning: 'bg-amber-500/10  text-amber-600  border-amber-500/20',
        danger:  'bg-red-500/10    text-red-600    border-red-500/20',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
