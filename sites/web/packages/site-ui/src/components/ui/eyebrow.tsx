import * as React from 'react';
import { cn } from '../../lib/utils';

export type EyebrowProps = {
  children: React.ReactNode;
  className?: string;
};

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5',
        'rounded-full border border-line bg-surface',
        'px-[0.52rem] py-[0.2rem]',
        'text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted',
        className
      )}
    >
      {children}
    </span>
  );
}
