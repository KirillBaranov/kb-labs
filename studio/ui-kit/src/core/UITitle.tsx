/**
 * UITitle component - Page/section titles with hierarchy
 *
 * Wraps Ant Design Typography.Title with consistent styling.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Typography, theme } from 'antd';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import { spacing } from '@kb-labs/studio-ui-core';

const { Title: AntTitle } = Typography;
const { useToken } = theme;

export type UITitleLevel = 1 | 2 | 3 | 4 | 5;

export interface UITitleProps {
  /** Title level (h1-h5) */
  level?: UITitleLevel;
  /** Title content */
  children: React.ReactNode;
  /** Optional subtitle */
  subtitle?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UITitle - Page or section title
 *
 * @example
 * ```tsx
 * <UITitle level={1}>Dashboard</UITitle>
 * <UITitle level={2} subtitle="Manage your settings">Settings</UITitle>
 * <UITitle level={3}>Section Title</UITitle>
 * ```
 */
export function UITitle({
  level = 1,
  children,
  subtitle,
  className,
  style,
}: UITitleProps) {
  const { token: _token } = useToken();

  if (subtitle) {
    return (
      <UIBox mb={subtitle ? 2 : 3}>
        <AntTitle level={level} className={className} style={{ margin: 0, ...style }}>
          {children}
        </AntTitle>
        <UIText
          size="base"
          color="secondary"
          as="div"
          style={{ marginTop: spacing[1] }}
        >
          {subtitle}
        </UIText>
      </UIBox>
    );
  }

  return (
    <AntTitle level={level} className={className} style={{ marginBottom: spacing[3], ...style }}>
      {children}
    </AntTitle>
  );
}
