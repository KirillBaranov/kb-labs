import * as React from 'react';
import { cn } from '../../lib/utils';

export type ChangeType = 'added' | 'changed' | 'fixed' | 'removed' | 'security' | 'new' | 'improved';

export interface ChangeItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntryProps {
  version: string;
  date: string;
  title?: string;
  description?: string;
  summary?: string;
  changes: ChangeItem[];
  latest?: boolean;
  last?: boolean;
  labels?: Partial<Record<ChangeType, string>>;
  className?: string;
}

// Colored pill badges per type — visually distinct, easy to scan
const TYPE_BADGE: Record<ChangeType, string> = {
  added:    'border-accent/30 bg-accent/10 text-accent',
  new:      'border-accent/30 bg-accent/10 text-accent',
  changed:  'border-sky-500/25 bg-sky-500/10 text-sky-400',
  improved: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
  fixed:    'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  removed:  'border-rose-500/25 bg-rose-500/10 text-rose-400',
  security: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
};

const DEFAULT_LABELS: Record<ChangeType, string> = {
  added:    'Added',
  new:      'New',
  changed:  'Changed',
  improved: 'Improved',
  fixed:    'Fixed',
  removed:  'Removed',
  security: 'Security',
};

export function ChangelogEntry({
  version, date, title, description, summary, changes, latest = false, last = false, labels = {}, className,
}: ChangelogEntryProps) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };

  // Group by type
  const typeOrder: ChangeType[] = ['added', 'new', 'changed', 'improved', 'fixed', 'removed', 'security'];
  const grouped = changes.reduce<Partial<Record<ChangeType, string[]>>>((acc, { type, text }) => {
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(text);
    return acc;
  }, {});
  const orderedTypes = typeOrder.filter((t) => grouped[t]);

  return (
    <div className={cn('flex gap-6', className)}>
      {/* Spine */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'mt-1.5 size-2.5 shrink-0 rounded-full border border-line bg-surface transition-colors',
          latest && 'border-accent/50 bg-accent/20 ring-2 ring-accent/15 ring-offset-1 ring-offset-bg',
        )} />
        {!last && <div className="mt-2 w-px flex-1 bg-line" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-12', last && 'pb-4')}>
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-sm font-bold text-kb-text">{version}</span>
          {latest && (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent">
              Latest
            </span>
          )}
          <span className="font-mono text-xs text-muted/60 dark:text-muted/45">{date}</span>
        </div>

        {/* Card */}
        <div className={cn(
          'rounded-xl border border-line px-5 py-4 flex flex-col gap-4',
          latest ? 'bg-surface/60' : 'bg-surface/30',
        )}>
          {(title || description || summary) && (
            <div>
              {title && <h3 className="mb-1 text-[0.95rem] font-semibold text-kb-text">{title}</h3>}
              {(description || summary) && (
                <p className="text-sm leading-relaxed text-muted/65">{description ?? summary}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {orderedTypes.map((type) => (
              <div key={type}>
                <span className={cn(
                  'mb-2.5 inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-wider',
                  TYPE_BADGE[type],
                )}>
                  {mergedLabels[type]}
                </span>
                <ul className="flex flex-col gap-1.5 pl-1">
                  {grouped[type]!.map((text, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted/70">
                      <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-line-strong" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
