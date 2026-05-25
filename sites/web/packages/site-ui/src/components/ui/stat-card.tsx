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

/** Parse a string like "100М+" → { num: 100, suffix: "М+" }, or null if no numeric part. */
function parseCountable(v: string): { num: number; suffix: string } | null {
  const match = v.match(/^(\d+)(.*)/);
  if (!match) return null;
  return { num: parseInt(match[1], 10), suffix: match[2] };
}

export function StatCard({ value, label, description, trend, className }: StatCardProps) {
  const parsed = typeof value === 'number'
    ? { num: value, suffix: '' }
    : parseCountable(String(value));

  const canCount = parsed !== null;

  const [display, setDisplay] = React.useState<string>(
    canCount ? `0${parsed!.suffix}` : String(value)
  );
  const ref = React.useRef<HTMLDivElement>(null);
  const hasAnimated = React.useRef(false);

  React.useEffect(() => {
    if (!canCount) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || hasAnimated.current) return;
        hasAnimated.current = true;
        const { num, suffix } = parsed!;
        const duration = 1400;
        const start = performance.now();

        function tick(now: number) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const current = Math.round(easeOut(progress) * num);
          setDisplay(`${current}${suffix}`);
          if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className={cn('flex flex-col gap-2', className)}>
      <div className="text-[2.8rem] font-bold tracking-tight text-kb-text leading-none">
        {display}
      </div>
      <div className="text-muted text-sm font-medium">{label}</div>
      {description && (
        <div className="text-muted/70 text-sm">{description}</div>
      )}
      {trend && (
        <div
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium mt-1 w-fit px-2 py-0.5 rounded-full',
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
