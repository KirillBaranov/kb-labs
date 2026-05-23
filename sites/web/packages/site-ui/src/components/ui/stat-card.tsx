'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface StatCardProps {
  value: string | number;
  label: string;
  description?: string;
  trend?: { value: string; up: boolean };
  className?: string;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function StatCard({ value, label, description, trend, className }: StatCardProps) {
  const isNumeric = typeof value === 'number';
  const [displayValue, setDisplayValue] = React.useState<string | number>(
    isNumeric ? 0 : value
  );
  const ref = React.useRef<HTMLDivElement>(null);
  const hasAnimated = React.useRef(false);

  React.useEffect(() => {
    if (!isNumeric) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const target = value as number;
          const duration = 1500;
          const start = performance.now();

          function tick(now: number) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOut(progress);
            const current = Math.round(eased * target);
            setDisplayValue(current);
            if (progress < 1) {
              requestAnimationFrame(tick);
            }
          }

          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isNumeric, value]);

  return (
    <div ref={ref} className={cn('flex flex-col gap-1', className)}>
      <div className="text-[2.8rem] font-bold tracking-tight text-kb-text leading-none">
        {displayValue}
      </div>
      <div className="text-muted text-sm font-medium">{label}</div>
      {description && (
        <div className="text-muted/70 text-xs mt-1">{description}</div>
      )}
      {trend && (
        <div
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium mt-1 w-fit px-2 py-0.5 rounded-full',
            trend.up
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
          )}
        >
          <span>{trend.up ? '↑' : '↓'}</span>
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
}
