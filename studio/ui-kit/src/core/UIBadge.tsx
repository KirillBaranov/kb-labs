/**
 * Badge component - Status indicator with semantic colors
 *
 * Uses Ant Design tokens for all colors.
 * NO hardcoded colors, NO inline styles.
 */

import * as React from 'react';
import { Badge as AntBadge, theme } from 'antd';
import type { BadgeProps as AntBadgeProps } from 'antd';

const { useToken } = theme;

export type UIBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface UIBadgeProps extends Omit<AntBadgeProps, 'status' | 'color'> {
  /** Semantic variant */
  variant?: UIBadgeVariant;
  /** Badge text */
  children?: React.ReactNode;
}

/**
 * Badge component with semantic colors
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error">Failed</Badge>
 * ```
 */
export function UIBadge({ variant = 'default', children, ...props }: UIBadgeProps) {
  const { token } = useToken();

  // Map semantic variants to Ant Design status
  const statusMap: Record<UIBadgeVariant, AntBadgeProps['status']> = {
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'processing',
    default: 'default',
  };

  // Map semantic variants to colors for text badges
  const colorMap: Record<UIBadgeVariant, string> = {
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
    info: token.colorInfo,
    default: token.colorTextSecondary,
  };

  if (children) {
    // Text badge
    return (
      <AntBadge
        color={colorMap[variant]}
        text={children}
        {...props}
      />
    );
  }

  // Status badge (dot)
  return (
    <AntBadge
      status={statusMap[variant]}
      {...props}
    />
  );
}
