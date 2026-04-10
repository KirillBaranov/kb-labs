/**
 * @module @kb-labs/studio-app/layouts/DashboardGrid
 * Dashboard Grid layout - responsive CSS Grid using design tokens
 *
 * Refactored to use spacing tokens and remove inline styles where possible.
 */

import * as React from 'react';
import { spacing } from '@kb-labs/studio-ui-core';
import { useUITheme } from '@kb-labs/studio-ui-kit';

export interface DashboardGridProps {
  children: React.ReactNode;
  cols?: {
    sm: number;
    md: number;
    lg: number;
  };
  rowHeight?: number;
  gap?: number;
}

export function DashboardGrid({
  children,
  cols = { sm: 4, md: 8, lg: 12 },
  rowHeight = 8,
  gap = 16
}: DashboardGridProps) {
  const { token } = useUITheme();
  const childrenArray = React.Children.toArray(children);

  // Use spacing tokens for gap if available
  const gridGap = gap === 16 ? spacing[4] : gap === 8 ? spacing[2] : `${gap}px`;

  return (
    <div
      className="widget-dashboard-grid"
      style={
        {
          '--cols-sm': cols.sm,
          '--cols-md': cols.md,
          '--cols-lg': cols.lg,
          '--row-height': `${rowHeight * 8}px`,
          '--gap': gridGap,
          '--border-color': token.colorBorder,
        } as React.CSSProperties
      }
    >
      {childrenArray.map((child, index) => {
        // Extract layoutHint from child props if available
        const layoutHint = (child as React.ReactElement)?.props?.layoutHint || { w: 4, h: 4 };
        const { w, h, minW, minH, height } = layoutHint;

        // Calculate height based on layoutHint.height
        let itemHeight: string | undefined;
        let itemMaxHeight: string | undefined;
        let itemMinHeight: string | undefined;

        if (height === 'fit-content') {
          itemHeight = 'fit-content';
        } else if (typeof height === 'number') {
          itemHeight = `${height}px`;
        } else if (height === 'auto' || height === undefined) {
          // Auto height: use grid rows but allow content to expand
          itemMinHeight = minH ? `${minH * rowHeight * 8}px` : `${h * rowHeight * 8}px`;
        } else {
          // Fallback: use grid-based height calculation
          itemMinHeight = minH ? `${minH * rowHeight * 8}px` : `${h * rowHeight * 8}px`;
        }

        return (
          <div
            key={index}
            className="widget-dashboard-grid__item"
            style={
              {
                gridColumn: `span ${w}`,
                gridRow: height === 'fit-content' ? 'span 1' : `span ${h}`,
                minWidth: minW ? `${minW * (100 / cols.lg)}%` : undefined,
                minHeight: itemMinHeight,
                height: itemHeight,
                maxHeight: itemMaxHeight,
              } as React.CSSProperties
            }
          >
            {child}
          </div>
        );
      })}
      <style>{`
        .widget-dashboard-grid {
          display: grid;
          grid-template-columns: repeat(var(--cols-sm), 1fr);
          gap: var(--gap);
          grid-auto-rows: minmax(var(--row-height), auto);
          align-items: start;
        }
        @media (min-width: 768px) {
          .widget-dashboard-grid {
            grid-template-columns: repeat(var(--cols-md), 1fr);
          }
        }
        @media (min-width: 1024px) {
          .widget-dashboard-grid {
            grid-template-columns: repeat(var(--cols-lg), 1fr);
          }
        }
        .widget-dashboard-grid__item {
          min-height: var(--row-height);
          display: flex;
          flex-direction: column;
        }
        .widget-dashboard-grid__item > * {
          flex: 1;
          min-height: 0;
        }
      `}</style>
    </div>
  );
}


