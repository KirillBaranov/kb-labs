import * as React from 'react';
import { cn } from '../../lib/utils';

export interface LabelValueItem {
  label: string;
  value: React.ReactNode;
}

export interface LabelValueTableProps {
  items: LabelValueItem[];
  /** Extra classes on the outer container */
  className?: string;
  /** Extra classes on every label span */
  labelClassName?: string;
  /** Extra classes on every value span */
  valueClassName?: string;
}

/**
 * Renders a bordered card with label → value rows.
 * Uses CSS grid `max-content` so all value cells start at the same column,
 * sized automatically to the widest label in this table — no hardcoded widths.
 *
 * Mobile: label stacked above value.
 * Desktop (sm+): label and value side-by-side in a two-column grid.
 */
export function LabelValueTable({
  items,
  className,
  labelClassName,
  valueClassName,
}: LabelValueTableProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-surface shadow-sm divide-y divide-line',
        className,
      )}
    >
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="grid grid-cols-1 gap-y-0.5 px-5 py-3.5 sm:grid-cols-[max-content_1fr] sm:items-baseline sm:gap-x-6 sm:gap-y-0"
        >
          <span
            className={cn(
              'whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-wider text-muted/50 dark:text-muted/35',
              labelClassName,
            )}
          >
            {label}
          </span>
          <span className={cn('text-sm text-muted/70', valueClassName)}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
