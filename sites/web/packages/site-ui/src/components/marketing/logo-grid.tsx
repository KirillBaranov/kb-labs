'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface LogoItem {
  name: string;
  src?: string;
  className?: string;
}

export interface LogoGridProps {
  logos: LogoItem[];
  mode?: 'grid' | 'marquee';
  speed?: 'slow' | 'normal' | 'fast';
  className?: string;
}

function LogoCell({ logo }: { logo: LogoItem }) {
  return (
    <div
      className={cn(
        'flex h-8 items-center justify-center',
        'opacity-40 grayscale transition-[opacity,filter] duration-200',
        'hover:opacity-70 hover:grayscale-0',
        logo.className
      )}
    >
      {logo.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={logo.name} className="h-full w-auto object-contain" />
      ) : (
        <span className="font-mono text-sm font-semibold tracking-wide text-muted/50">
          {logo.name}
        </span>
      )}
    </div>
  );
}

export function LogoGrid({ logos, mode = 'marquee', speed = 'normal', className }: LogoGridProps) {
  if (mode === 'grid') {
    return (
      <div className={cn('grid grid-cols-3 items-center gap-6 md:grid-cols-6', className)}>
        {logos.map((logo, i) => (
          <LogoCell key={i} logo={logo} />
        ))}
      </div>
    );
  }

  const doubled = [...logos, ...logos];

  return (
    <div className={cn('w-full overflow-hidden', className)}>
      <div
        className="marquee-track flex w-max items-center gap-10 hover:[animation-play-state:paused]"
        data-speed={speed}
      >
        {doubled.map((logo, i) => (
          <div key={i} className="shrink-0">
            <LogoCell logo={logo} />
          </div>
        ))}
      </div>
    </div>
  );
}
