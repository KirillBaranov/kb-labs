import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
      {children}
    </div>
  );
}

export interface BentoCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  span?: 1 | 2 | 3;
}

const spanClass: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
};

export function BentoCard({
  title,
  description,
  icon,
  className,
  children,
  span = 1,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-line rounded-xl p-6 flex flex-col gap-3',
        'hover:border-line-strong transition-colors duration-200',
        spanClass[span],
        className
      )}
    >
      {icon && (
        <div className="text-muted w-fit">{icon}</div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-kb-text font-semibold text-base leading-snug">{title}</h3>
        {description && (
          <p className="text-muted text-sm leading-relaxed">{description}</p>
        )}
      </div>
      {children && <div className="flex-1">{children}</div>}
    </div>
  );
}
