import * as React from 'react';
import { cn } from '../../lib/utils';
import { Eyebrow } from '../ui/eyebrow';

export type SectionHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
  titleClassName?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  align = 'left',
  className,
  titleClassName,
}: SectionHeaderProps) {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        'mb-[clamp(2rem,4vw,3rem)]',
        action && 'flex items-start justify-between gap-6',
        className
      )}
    >
      <div className={cn('flex flex-col gap-3', centered && 'items-center text-center')}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2
          className={cn(
            'm-0 text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.1]',
            'tracking-tight text-kb-text',
            centered && 'max-w-[20ch]',
            titleClassName
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={cn(
              'm-0 text-[1.05rem] leading-[1.65] text-muted',
              centered ? 'max-w-[52ch]' : 'max-w-[42ch]'
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="mt-1 shrink-0">{action}</div>}
    </div>
  );
}
