import * as React from 'react';
import { cn } from '../../lib/utils';

export interface GradientOrbsProps {
  className?: string;
  variant?: 'hero' | 'section';
}

export function GradientOrbs({ className, variant = 'hero' }: GradientOrbsProps) {
  if (variant === 'hero') {
    return (
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 overflow-hidden pointer-events-none',
          className
        )}
      >
        {/* Primary large orb */}
        <div
          className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-accent/[0.12] blur-[120px]"
        />
        {/* Secondary orb */}
        <div
          className="absolute top-1/4 -right-24 w-[480px] h-[480px] rounded-full bg-kb-text/[0.04] blur-[100px]"
        />
        {/* Tertiary subtle orb */}
        <div
          className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-accent/[0.06] blur-[80px]"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none',
        className
      )}
    >
      {/* Section variant — smaller, subtler */}
      <div
        className="absolute -top-16 left-1/4 w-[280px] h-[280px] rounded-full bg-accent/[0.10] blur-[80px]"
      />
      <div
        className="absolute bottom-0 right-1/4 w-[220px] h-[220px] rounded-full bg-kb-text/[0.04] blur-[60px]"
      />
    </div>
  );
}
