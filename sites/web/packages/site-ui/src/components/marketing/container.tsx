import * as React from 'react';
import { cn } from '../../lib/utils';

export type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  maxWidth?: string;
};

export function Container({ className, maxWidth, style, ...props }: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-[min(calc(100%-2.4rem),var(--container,1140px))]',
        className
      )}
      style={maxWidth ? { '--container': maxWidth, ...style } as React.CSSProperties : style}
      {...props}
    />
  );
}
