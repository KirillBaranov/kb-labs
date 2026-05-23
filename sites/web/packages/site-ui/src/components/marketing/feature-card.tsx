import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

export type FeatureCardProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  href?: string;
  children?: React.ReactNode;
  className?: string;
};

export function FeatureCard({
  title,
  description,
  icon: Icon,
  href,
  children,
  className,
}: FeatureCardProps) {
  const Tag = href ? 'a' : 'div';

  return (
    <Tag
      href={href}
      className={cn(
        'flex flex-col gap-3 bg-surface p-4',
        'transition-all duration-200',
        'hover:bg-bg hover:shadow-[inset_0_-2px_0_0_rgb(var(--color-accent))]',
        href && 'cursor-pointer',
        className
      )}
    >
      {Icon && (
        <div className="flex size-9 items-center justify-center rounded-lg border border-line bg-bg text-muted">
          <Icon size={18} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[1.2rem] font-bold leading-snug tracking-tight text-kb-text">
          {title}
        </h3>
        {description && (
          <p className="m-0 text-[0.95rem] leading-[1.65] text-muted">{description}</p>
        )}
      </div>
      {children}
    </Tag>
  );
}
