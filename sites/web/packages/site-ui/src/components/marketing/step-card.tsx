import * as React from 'react';
import { cn } from '../../lib/utils';

export type StepCardProps = {
  num: string | number;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

export function StepCard({ num, title, description, children, className }: StepCardProps) {
  const label = typeof num === 'number' ? String(num).padStart(2, '0') : num;

  return (
    <div
      className={cn(
        'flex flex-col gap-[0.6rem] rounded-xl border border-line bg-surface',
        'p-[clamp(1.5rem,3vw,2rem)]',
        className
      )}
    >
      <span className="text-[0.75rem] font-bold tracking-[0.08em] text-muted">{label}</span>
      <h3 className="text-[1.1rem] font-bold leading-snug tracking-tight text-kb-text">
        {title}
      </h3>
      {description && (
        <p className="text-[0.95rem] leading-[1.6] text-muted">{description}</p>
      )}
      {children}
    </div>
  );
}
