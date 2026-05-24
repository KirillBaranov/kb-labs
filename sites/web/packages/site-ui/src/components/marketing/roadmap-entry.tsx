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
  period: string;
  theme: string;
  status: RoadmapStatus;
  items: RoadmapItem[];
  /** Highlight this entry as the current quarter */
  current?: boolean;
  /** Hide the bottom timeline line (last entry) */
  last?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<RoadmapStatus, {
  label: string;
  dot: string;
  badge: string;
  itemDot: string;
}> = {
  shipped:     { label: 'Готово',        dot: 'bg-emerald-500 border-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', itemDot: 'bg-emerald-500/70' },
  'in-progress': { label: 'В работе',   dot: 'bg-accent border-accent',           badge: 'bg-accent/10 text-accent border-accent/20',               itemDot: 'bg-accent/70' },
  planned:     { label: 'Запланировано', dot: 'bg-surface border-line-strong',     badge: 'bg-surface text-muted border-line',                        itemDot: 'bg-muted/30' },
  exploring:   { label: 'Исследуем',    dot: 'bg-surface border-amber-500/50',    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       itemDot: 'bg-amber-500/60' },
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
  const { label, badge } = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium', badge)}>
      {label}
    </span>
  );
}

export function RoadmapEntry({
  quarter,
  period,
  theme,
  status,
  items,
  current = false,
  last = false,
  className,
}: RoadmapEntryProps) {
  const { dot } = STATUS_CONFIG[status];

  const shipped = items.filter((i) => i.status === 'shipped').length;
  const total = items.length;
  const pct = total > 0 ? Math.round((shipped / total) * 100) : 0;

  // Group items by status for display order
  const ORDER: RoadmapStatus[] = ['shipped', 'in-progress', 'planned', 'exploring'];
  const sorted = [...items].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );

  return (
    <div className={cn('flex gap-8', className)}>
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'mt-1 size-3 shrink-0 rounded-full border-2 transition-colors',
          dot,
          current && 'ring-2 ring-accent/30 ring-offset-2 ring-offset-bg',
        )} />
        {!last && <div className="mt-2 w-px flex-1 bg-line" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-14', last && 'pb-4')}>

        {/* Quarter header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="font-mono text-base font-bold text-kb-text">{quarter}</span>
              {current && (
                <span className="rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-accent">
                  Сейчас
                </span>
              )}
            </div>
            <p className="text-sm text-muted/50">{period} · {theme}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={status} />
            {(status === 'shipped' || status === 'in-progress') && (
              <div className="flex items-center gap-2">
                <div className="h-1 w-20 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[0.7rem] tabular-nums text-muted/40">{shipped}/{total}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-2">
          {sorted.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 transition-colors hover:bg-surface"
              >
                <span className={cn('mt-[0.45em] size-1.5 shrink-0 rounded-full', cfg.itemDot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-kb-text">{item.title}</span>
                    {item.status !== status && (
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider',
                        cfg.badge,
                      )}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-sm leading-relaxed text-muted/55">{item.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
