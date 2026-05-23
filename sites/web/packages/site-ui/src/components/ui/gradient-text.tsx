import * as React from 'react';
import { cn } from '../../lib/utils';

export interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  /** CSS color value or var(). Defaults to accent color. */
  from?: string;
  /** CSS color value or var(). Defaults to 60% text color. */
  to?: string;
  shimmer?: boolean;
}

export function GradientText({
  children,
  className,
  from = 'rgb(var(--color-accent))',
  to = 'rgb(var(--color-text) / 0.55)',
  shimmer = false,
}: GradientTextProps) {
  return (
    <span
      className={cn('bg-clip-text text-transparent', shimmer && 'gradient-text-shimmer', className)}
      style={{
        backgroundImage: `linear-gradient(to right, ${from}, ${to})`,
        ...(shimmer ? { backgroundSize: '200% auto' } : {}),
      }}
    >
      {children}
    </span>
  );
}
