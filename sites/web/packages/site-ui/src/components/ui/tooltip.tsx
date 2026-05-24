'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  children: React.ReactNode;
  content: string | React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const sideClasses: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  right: 'left-full ml-2 top-1/2 -translate-y-1/2',
};

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  return (
    <div className={cn('relative inline-flex group', className)}>
      {children}
      <div
        className={cn(
          'absolute pointer-events-none z-50 whitespace-nowrap',
          'bg-surface border border-line rounded-md px-2 py-1 text-sm text-kb-text shadow-card',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          sideClasses[side]
        )}
      >
        {content}
      </div>
    </div>
  );
}
