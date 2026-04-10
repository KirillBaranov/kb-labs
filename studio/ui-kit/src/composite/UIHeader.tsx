/**
 * UIHeader component - Page header with title, subtitle, and breadcrumbs
 *
 * Displays page title with optional subtitle, breadcrumbs, and actions.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import { UIFlex } from '../primitives/UIFlex';
import { UITitle } from '../core/UITitle';
import { spacing } from '@kb-labs/studio-ui-core';

const { useToken } = theme;

export interface UIHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Breadcrumb component */
  breadcrumb?: React.ReactNode;
  /** Action buttons (right side) */
  actions?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIHeader - Page header
 *
 * @example
 * ```tsx
 * <UIHeader
 *   title="Dashboard"
 *   subtitle="Overview of your workspace"
 * />
 *
 * <UIHeader
 *   title="Workflows"
 *   breadcrumb={<UIBreadcrumb items={[{ title: 'Home' }, { title: 'Workflows' }]} />}
 *   actions={<UIButton variant="primary">Create Workflow</UIButton>}
 * />
 * ```
 */
export function UIHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  className,
  style: customStyle,
}: UIHeaderProps) {
  const { token } = useToken();

  const style: React.CSSProperties = {
    borderBottom: `1px solid ${token.colorBorder}`,
    paddingBottom: spacing[4],
    marginBottom: spacing[6],
    ...customStyle,
  };

  return (
    <UIBox className={className} style={style}>
      {breadcrumb && (
        <UIBox mb={2}>
          {breadcrumb}
        </UIBox>
      )}

      <UIFlex justify="between" align="start" gap={4}>
        <UIBox style={{ flex: 1 }}>
          <UITitle level={1} style={{ marginBottom: subtitle ? spacing[2] : 0 }}>
            {title}
          </UITitle>
          {subtitle && (
            <UIText size="base" color="secondary">
              {subtitle}
            </UIText>
          )}
        </UIBox>

        {actions && (
          <UIBox style={{ flexShrink: 0 }}>
            {actions}
          </UIBox>
        )}
      </UIFlex>
    </UIBox>
  );
}
