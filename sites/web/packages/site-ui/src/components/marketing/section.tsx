import * as React from 'react';
import { cn } from '../../lib/utils';

export type SectionProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  variant?: 'default' | 'tinted';
  noBorder?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const SIZE = {
  sm: 'py-20',
  md: 'py-28',
  lg: 'py-36',
};

export function Section({
  as: Tag = 'section',
  className,
  variant = 'default',
  noBorder = true,
  size = 'sm',
  ...props
}: SectionProps) {
  return (
    <Tag
      className={cn(
        SIZE[size],
        !noBorder && 'border-b border-line',
        className
      )}
      {...props}
    />
  );
}
