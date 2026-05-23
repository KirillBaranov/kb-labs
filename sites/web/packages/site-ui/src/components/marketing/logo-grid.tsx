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

const speedMap: Record<string, string> = {
  slow: '40s',
  normal: '25s',
  fast: '15s',
};

function LogoItem({ logo }: { logo: LogoItem }) {
  return (
    <div
      className={cn(
        'h-8 flex items-center justify-center',
        'opacity-40 hover:opacity-70 transition-opacity duration-200',
        'grayscale hover:grayscale-0',
        logo.className
      )}
    >
      {logo.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={logo.name} className="h-full w-auto object-contain" />
      ) : (
        <span className="font-mono text-muted/50 text-sm font-semibold tracking-wide">
          {logo.name}
        </span>
      )}
    </div>
  );
}

export function LogoGrid({ logos, mode = 'marquee', speed = 'normal', className }: LogoGridProps) {
  const duration = speedMap[speed];

  if (mode === 'grid') {
    return (
      <div className={cn('grid grid-cols-3 md:grid-cols-6 gap-6 items-center', className)}>
        {logos.map((logo, i) => (
          <LogoItem key={i} logo={logo} />
        ))}
      </div>
    );
  }

  // Marquee mode — duplicate logos for seamless loop
  const doubled = [...logos, ...logos];

  return (
    <div className={cn('overflow-hidden w-full', className)}>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="flex gap-10 items-center w-max hover:[animation-play-state:paused]"
        style={{
          animation: `marquee ${duration} linear infinite`,
        }}
      >
        {doubled.map((logo, i) => (
          <div key={i} className="shrink-0">
            <LogoItem logo={logo} />
          </div>
        ))}
      </div>
    </div>
  );
}
