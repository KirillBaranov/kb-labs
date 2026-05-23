import * as React from 'react';
import { cn } from '../../lib/utils';

export interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;
  to?: string;
  shimmer?: boolean;
}

export function GradientText({
  children,
  className,
  from = 'accent',
  to = 'kb-text/60',
  shimmer = false,
}: GradientTextProps) {
  const shimmerStyle: React.CSSProperties = shimmer
    ? {
        backgroundSize: '200% auto',
        animation: 'shimmer 3s ease infinite',
      }
    : {};

  return (
    <>
      {shimmer && (
        <style>{`
          @keyframes shimmer {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
        `}</style>
      )}
      <span
        className={cn(
          'bg-clip-text text-transparent bg-gradient-to-r',
          `from-${from} to-${to}`,
          className
        )}
        style={shimmerStyle}
      >
        {children}
      </span>
    </>
  );
}
