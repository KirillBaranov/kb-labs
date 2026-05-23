'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export function GlowCard({
  children,
  className,
  glowColor = 'rgba(12, 102, 255, 0.13)',
}: GlowCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleMouseLeave() {
    setPos(null);
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('relative', className)}
      style={
        pos
          ? {
              background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 70%), rgb(var(--color-surface))`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
