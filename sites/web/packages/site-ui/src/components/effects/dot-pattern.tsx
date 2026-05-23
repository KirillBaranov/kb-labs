import * as React from 'react';
import { cn } from '../../lib/utils';

export interface DotPatternProps {
  className?: string;
  size?: number;
  cr?: number;
}

export function DotPattern({ className, size = 24, cr = 1 }: DotPatternProps) {
  const id = React.useId();
  const patternId = `dot-pattern-${id.replace(/:/g, '')}`;

  return (
    <svg
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full text-line',
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={cr} cy={cr} r={cr} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

export interface GridPatternProps {
  className?: string;
  size?: number;
}

export function GridPattern({ className, size = 24 }: GridPatternProps) {
  const id = React.useId();
  const patternId = `grid-pattern-${id.replace(/:/g, '')}`;

  return (
    <svg
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full text-line',
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
