'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Tight bordered variant — 1px gap acts as divider line,
   * no individual card borders needed.
   */
  bordered?: boolean;
}

export function BentoGrid({ children, className, bordered = false }: BentoGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-3',
        bordered
          ? 'gap-px bg-line rounded-2xl border border-line overflow-hidden'
          : 'gap-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface BentoCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  span?: 1 | 2 | 3;
  glow?: boolean;
  glowColor?: string;
  /** Must match parent BentoGrid bordered prop */
  bordered?: boolean;
}

const spanClass: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
};

export function BentoCard({
  title,
  description,
  icon,
  className,
  children,
  span = 1,
  glow = true,
  glowColor = 'rgba(12, 102, 255, 0.13)',
  bordered = false,
}: BentoCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!glow) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ x: clientX - rect.left, y: clientY - rect.top });
      rafRef.current = null;
    });
  }

  function handleMouseLeave() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPos(null);
  }

  React.useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  const bgStyle =
    glow && pos
      ? {
          background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 70%), rgb(var(--color-surface))`,
        }
      : undefined;

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={bgStyle}
      className={cn(
        'flex flex-col gap-3',
        bordered
          ? 'bg-surface p-6'
          : 'bg-surface border border-line-strong rounded-xl p-6 hover:border-accent/40 transition-[border-color] duration-200',
        spanClass[span],
        className,
      )}
    >
      {icon && <div className="text-muted w-fit">{icon}</div>}
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-base font-semibold leading-snug text-kb-text">{title}</h3>
        {description && (
          <p className="m-0 text-sm leading-relaxed text-muted/60">{description}</p>
        )}
      </div>
      {children && <div className="flex-1">{children}</div>}
    </div>
  );
}
