import * as React from 'react';
import { cn } from '../../lib/utils';

export type RoadmapStatus = 'shipped' | 'in-progress' | 'planned' | 'exploring';

export interface RoadmapItem {
  title: string;
  description?: string;
  status: RoadmapStatus;
}

export interface RoadmapEntryProps {
  quarter: string;
  period?: string;
  theme: string;
  status: RoadmapStatus;
  items: RoadmapItem[];
  current?: boolean;
  last?: boolean;
  labels: {
    shipped: string;
    inProgress: string;
    planned: string;
    exploring: string;
    current: string;
  };
  className?: string;
}

// Neutral: same badge shape, only dot color changes
const STATUS_DOT: Record<RoadmapStatus, string> = {
  'shipped':     'bg-kb-text/50',
  'in-progress': 'bg-accent animate-pulse',
  'planned':     'bg-muted/25 border border-line',
  'exploring':   'bg-muted/40',
};

const ITEM_DOT: Record<RoadmapStatus, string> = {
  'shipped':     'bg-kb-text/40',
  'in-progress': 'bg-accent/80',
  'planned':     'bg-muted/20 border border-line',
  'exploring':   'bg-muted/35',
};

function StatusBadge({ status, labels }: { status: RoadmapStatus; labels: RoadmapEntryProps['labels'] }) {
  const map: Record<RoadmapStatus, string> = {
    'shipped':     labels.shipped,
    'in-progress': labels.inProgress,
    'planned':     labels.planned,
    'exploring':   labels.exploring,
  };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[0.65rem] text-muted/60">
      <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
      {map[status]}
    </span>
  );
}

export function RoadmapEntry({
  quarter, period, theme, status, items, current = false, last = false, labels, className,
}: RoadmapEntryProps) {
  const shipped = items.filter((i) => i.status === 'shipped').length;
  const total = items.length;
  const pct = total > 0 ? Math.round((shipped / total) * 100) : 0;

  const ORDER: RoadmapStatus[] = ['in-progress', 'shipped', 'planned', 'exploring'];
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div className={cn('flex gap-6', className)}>
      {/* Spine */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'mt-1.5 size-2.5 shrink-0 rounded-full border border-line bg-surface transition-colors',
          current && 'border-accent/50 bg-accent/20 ring-2 ring-accent/15 ring-offset-1 ring-offset-bg',
        )} />
        {!last && <div className="mt-2 w-px flex-1 bg-line" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-12', last && 'pb-4')}>
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-kb-text">{quarter}</span>
              {current && (
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent">
                  {labels.current}
                </span>
              )}
            </div>
            {(period || theme) && (
              <p className="text-xs text-muted/50">{[period, theme].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={status} labels={labels} />
            {(status === 'shipped' || status === 'in-progress') && total > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-1 w-20 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-kb-text/30 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-[0.65rem] tabular-nums text-muted/55 dark:text-muted/40">{shipped}/{total}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-2">
          {sorted.map((item) => (
            <div
              key={item.title}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-line px-4 py-3 transition-colors',
                current ? 'bg-surface/60 hover:bg-surface' : 'bg-surface/30 hover:bg-surface/60',
              )}
            >
              <span className={cn('mt-[0.45em] size-1.5 shrink-0 rounded-full', ITEM_DOT[item.status])} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-kb-text">{item.title}</span>
                  {item.status !== status && (
                    <StatusBadge status={item.status} labels={labels} />
                  )}
                </div>
                {item.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted/55">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
