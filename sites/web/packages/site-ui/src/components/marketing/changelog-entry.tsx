import * as React from 'react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';

export type ChangeType = 'added' | 'changed' | 'fixed' | 'removed' | 'security';

export interface ChangeItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntryProps {
  version: string;
  date: string;
  title?: string;
  description?: string;
  changes: ChangeItem[];
  latest?: boolean;
  className?: string;
}

const changeStyles: Record<ChangeType, { label: string; className: string }> = {
  added:    { label: 'Added',    className: 'text-emerald-400 before:bg-emerald-500' },
  changed:  { label: 'Changed',  className: 'text-accent before:bg-accent' },
  fixed:    { label: 'Fixed',    className: 'text-amber-400 before:bg-amber-500' },
  removed:  { label: 'Removed',  className: 'text-red-400 before:bg-red-500' },
  security: { label: 'Security', className: 'text-purple-400 before:bg-purple-500' },
};

export function ChangelogEntry({
  version,
  date,
  title,
  description,
  changes,
  latest = false,
  className,
}: ChangelogEntryProps) {
  const grouped = changes.reduce<Partial<Record<ChangeType, string[]>>>((acc, { type, text }) => {
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(text);
    return acc;
  }, {});

  return (
    <div className={cn('flex gap-6', className)}>
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className={cn(
          'size-3 shrink-0 rounded-full border-2',
          latest ? 'border-accent bg-accent' : 'border-line-strong bg-surface'
        )} />
        <div className="mt-2 w-px flex-1 bg-line" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-sm font-bold text-kb-text">{version}</span>
          {latest && <Badge variant="accent">Latest</Badge>}
          <span className="text-xs text-muted">{date}</span>
        </div>

        {title && (
          <h3 className="m-0 text-[1.1rem] font-semibold leading-snug tracking-tight text-kb-text">
            {title}
          </h3>
        )}

        {description && (
          <p className="m-0 text-[0.95rem] leading-relaxed text-muted">{description}</p>
        )}

        <div className="flex flex-col gap-3">
          {(Object.keys(grouped) as ChangeType[]).map((type) => {
            const { label, className: typeClass } = changeStyles[type];
            return (
              <div key={type}>
                <span className={cn(
                  'mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.07em]',
                  'before:size-1.5 before:rounded-full before:content-[""]',
                  typeClass
                )}>
                  {label}
                </span>
                <ul className="m-0 list-none p-0 flex flex-col gap-1">
                  {grouped[type]!.map((text, i) => (
                    <li key={i} className="flex items-start gap-2 text-[0.9rem] text-muted">
                      <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-line-strong" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
