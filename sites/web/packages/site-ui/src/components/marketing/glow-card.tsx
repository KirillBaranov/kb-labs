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
  glowColor = 'rgba(12, 102, 255, 0.15)',
}: GlowCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: '50%', y: '50%' });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({ x: `${x}%`, y: `${y}%` });
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={cn('relative overflow-hidden', className)}
    >
      {/* Glow overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px circle at ${pos.x} ${pos.y}, ${glowColor}, transparent 70%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
