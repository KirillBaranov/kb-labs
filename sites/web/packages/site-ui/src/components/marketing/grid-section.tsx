import * as React from 'react';
import { cn } from '../../lib/utils';

const colsMap = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
} as const;

export type GridSectionProps = {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
};

export function GridSection({ cols = 3, children, className }: GridSectionProps) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border border-line bg-line',
        colsMap[cols],
        className
      )}
    >
      {children}
    </div>
  );
}
