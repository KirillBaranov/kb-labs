import * as React from 'react';
import { Check, Minus, Slash } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ComparisonRow {
  feature: string;
  values: (string | boolean)[];
}

export interface ComparisonCategory {
  label: string;
  rows: ComparisonRow[];
}

export interface ComparisonTableProps {
  headers: string[];
  categories: ComparisonCategory[];
  /** 1-based index in headers (0 = feature column) to highlight */
  highlightCol?: number;
  className?: string;
}

function Cell({ value, highlight }: { value: string | boolean; highlight: boolean }) {
  const base = cn(
    'mx-auto flex items-center justify-center size-5 rounded-full transition-transform duration-150',
    highlight && 'scale-110',
  );

  if (value === true) {
    return (
      <span className={cn(base, highlight ? 'bg-accent/15' : '')}>
        <Check className={cn('size-3.5', highlight ? 'text-accent' : 'text-muted/50')} aria-label="Yes" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className={base}>
        <Minus className="size-3.5 text-muted/50" aria-label="No" />
      </span>
    );
  }
  if (value === '~') {
    return (
      <span className={base}>
        <Slash className="size-3.5 text-muted/50" aria-label="Partial" />
      </span>
    );
  }
  if (value === '—') {
    return <span className="text-sm text-muted/50">—</span>;
  }
  return (
    <span className={cn('text-sm', highlight ? 'font-semibold text-kb-text' : 'text-muted/70')}>
      {String(value)}
    </span>
  );
}

export function ComparisonTable({ headers, categories, highlightCol, className }: ComparisonTableProps) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface/60">
              {headers.map((h, i) => {
                const isHighlight = highlightCol !== undefined && i === highlightCol;
                return (
                  <th
                    key={h}
                    className={cn(
                      'px-5 py-3.5 font-semibold',
                      i === 0 ? 'w-[38%] text-left text-muted/50 text-sm uppercase tracking-wider' : 'text-center',
                      isHighlight ? 'text-accent bg-accent/5' : 'text-kb-text',
                    )}
                  >
                    {isHighlight ? (
                      <span className="inline-flex items-center gap-1.5">
                        {h}
                        <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent">
                          вы
                        </span>
                      </span>
                    ) : h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <React.Fragment key={cat.label}>
                {/* Category header */}
                <tr className="border-b border-line bg-bg/40">
                  <td
                    colSpan={headers.length}
                    className="px-5 py-2 text-[0.65rem] font-bold uppercase tracking-widest text-muted/50 dark:text-muted/35"
                  >
                    {cat.label}
                  </td>
                </tr>

                {cat.rows.map((row) => (
                  <tr
                    key={row.feature}
                    className="group border-b border-line last:border-0 transition-colors duration-150 hover:bg-accent/[0.04]"
                  >
                    {/* Feature name */}
                    <td className="relative px-5 py-3.5 text-muted/70">
                      {/* Left accent line on hover */}
                      <span className="absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      {row.feature}
                    </td>

                    {/* Values */}
                    {row.values.map((v, vi) => {
                      const isHighlight = highlightCol !== undefined && vi + 1 === highlightCol;
                      return (
                        <td
                          key={vi}
                          className={cn(
                            'px-5 py-3.5 text-center',
                            isHighlight && 'bg-accent/[0.03]',
                          )}
                        >
                          <Cell value={v} highlight={isHighlight} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
