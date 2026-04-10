/**
 * @module @kb-labs/studio-app/components/page-header
 * Page header component with title, description, and optional actions
 */

import * as React from 'react';
import { UITitle, UITypographyText } from '@kb-labs/studio-ui-kit';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  style,
}: PageHeaderProps): React.ReactElement {
  return (
    <div className={className} style={{ marginBottom: '24px', ...style }}>
      {breadcrumbs && <div style={{ marginBottom: '12px' }}>{breadcrumbs}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <UITitle level={1} className="typo-page-title" style={{ margin: 0, marginBottom: description ? '8px' : 0, color: 'var(--text-primary)' }}>
            {title}
          </UITitle>
          {description && (
            <UITypographyText className="typo-description" style={{ color: 'var(--text-secondary)', display: 'block' }}>
              {description}
            </UITypographyText>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
