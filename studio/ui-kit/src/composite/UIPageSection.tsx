/**
 * UIPageSection component - Section within a page
 *
 * Adds consistent bottom margin between page sections.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';

export interface UIPageSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Bottom margin in px, default 24 */
  gap?: number;
}

export function UIPageSection({ children, gap = 24, style, ...rest }: UIPageSectionProps) {
  return (
    <div style={{ marginBottom: gap, ...style }} {...rest}>
      {children}
    </div>
  );
}
