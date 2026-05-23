'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BorderBeamProps {
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
}

export function BorderBeam({
  size = 200,
  duration = 10,
  colorFrom = '#0c66ff',
  colorTo = 'transparent',
  className,
}: BorderBeamProps) {
  const id = React.useId().replace(/:/g, '');

  return (
    <>
      <style>{`
        @property --angle-${id} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes border-beam-${id} {
          from { --angle-${id}: 0deg; }
          to   { --angle-${id}: 360deg; }
        }
        .border-beam-${id} {
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: conic-gradient(
            from var(--angle-${id}),
            transparent 0%,
            ${colorFrom} 25%,
            ${colorTo} 50%,
            transparent 75%
          );
          animation: border-beam-${id} ${duration}s linear infinite;
          pointer-events: none;
        }
      `}</style>
      <span
        aria-hidden
        className={cn(`border-beam-${id}`, className)}
      />
    </>
  );
}
