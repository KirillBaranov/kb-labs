import * as React from 'react';
import { cn } from '../../lib/utils';

/* ── Types ─────────────────────────────────────────────────── */

export interface DataTableColumn {
  key: string;
  label: React.ReactNode;
  /** Tailwind class for <th> / <td> alignment. Default: 'text-left' */
  align?: 'text-left' | 'text-center' | 'text-right';
  /** Extra class applied to both <th> and <td> for this column */
  className?: string;
}

export interface DataTableRow {
  key: string;
  cells: Record<string, React.ReactNode>;
  /** Highlight this row (accent tint) */
  highlight?: boolean;
  /** Dim this row (unsupported / disabled) */
  muted?: boolean;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  className?: string;
}

/* ── Component ─────────────────────────────────────────────── */

export function DataTable({ columns, rows, className }: DataTableProps) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-5 py-3.5 font-semibold text-muted/50 text-sm uppercase tracking-wider',
                    col.align ?? 'text-left',
                    col.className,
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  'border-b border-line last:border-0 transition-colors duration-150',
                  row.highlight && 'bg-accent/[0.04]',
                  row.muted && 'opacity-40',
                  !row.muted && 'hover:bg-accent/[0.03]',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-5 py-3.5 text-muted/70',
                      col.align ?? 'text-left',
                      col.className,
                    )}
                  >
                    {row.cells[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
