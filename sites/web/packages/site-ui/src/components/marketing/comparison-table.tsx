import * as React from 'react';
import { Check, Minus } from 'lucide-react';
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
  className?: string;
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-accent" aria-label="Yes" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted/40" aria-label="No" />;
  return <span className="text-sm text-kb-text">{String(value)}</span>;
}

export function ComparisonTable({ headers, categories, className }: ComparisonTableProps) {
  return (
    <div className={cn('rounded-xl border border-line-strong', className)}>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-bg">
            {headers.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'sticky top-0 z-10 bg-bg px-4 py-3 font-semibold text-kb-text',
                  i === 0 ? 'w-[40%] text-left' : 'text-center'
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <React.Fragment key={cat.label}>
              <tr className="border-b border-line bg-bg">
                <td
                  colSpan={headers.length}
                  className="px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted/70"
                >
                  {cat.label}
                </td>
              </tr>
              {cat.rows.map((row) => (
                <tr key={row.feature} className="border-b border-line last:border-0 hover:bg-bg/60 transition-colors">
                  <td className="px-4 py-3 text-kb-text">{row.feature}</td>
                  {row.values.map((v, vi) => (
                    <td key={vi} className="px-4 py-3 text-center">
                      <Cell value={v} />
                    </td>
                  ))}
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
