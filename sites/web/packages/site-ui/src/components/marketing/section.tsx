import * as React from 'react';
import { cn } from '../../lib/utils';

export type SectionProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  variant?: 'default' | 'tinted';
  noBorder?: boolean;
};

export function Section({
  as: Tag = 'section',
  className,
  variant = 'default',
  noBorder = false,
  ...props
}: SectionProps) {
  return (
    <Tag
      className={cn(
        'py-[clamp(3rem,6vw,5rem)]',
        !noBorder && 'border-b border-line',
        variant === 'default' && 'bg-surface',
        variant === 'tinted' && 'bg-bg',
        className
      )}
      {...props}
    />
  );
}
