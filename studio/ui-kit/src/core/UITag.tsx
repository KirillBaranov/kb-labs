/**
 * UITag component - Label/category tag with semantic colors
 *
 * Wraps Ant Design Tag with semantic variants.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Tag as AntTag, theme } from 'antd';
import type { TagProps as AntTagProps } from 'antd';
import './UITag.module.css';

const { useToken } = theme;

export type UITagVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'neutral';

export interface UITagProps extends Omit<AntTagProps, 'color'> {
  /** Semantic variant */
  variant?: UITagVariant;
  /** Direct color override (Ant Design color name or hex) */
  color?: string;
  /** Tag content */
  children: React.ReactNode;
  /** Closable tag */
  closable?: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Icon element */
  icon?: React.ReactNode;
}

/**
 * UITag - Label or category indicator
 *
 * @example
 * ```tsx
 * <UITag variant="success">Active</UITag>
 * <UITag variant="warning" closable onClose={() => {}}>Pending</UITag>
 * <UITag variant="error">Failed</UITag>
 * <UITag variant="info" icon={<InfoIcon />}>Info</UITag>
 * ```
 */
export function UITag({
  variant = 'default',
  color,
  children,
  closable,
  onClose,
  icon,
  className,
  onClick,
  ...rest
}: UITagProps) {
  const { token } = useToken();

  const colorMap: Record<UITagVariant, string> = {
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
    info: token.colorInfo,
    default: token.colorPrimary,
    neutral: token.colorTextSecondary,
  };

  const combinedClassName = ['kb-ui-tag', className].filter(Boolean).join(' ');

  return (
    <AntTag
      color={color ?? colorMap[variant]}
      closable={closable}
      onClose={onClose}
      icon={icon}
      className={combinedClassName}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
      {...rest}
    >
      {children}
    </AntTag>
  );
}
