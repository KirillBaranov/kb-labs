/**
 * UITag component - Label/category tag with semantic colors
 *
 * Wraps Ant Design Tag with semantic variants.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Tag as AntTag } from 'antd';
import type { TagProps as AntTagProps } from 'antd';
import clsx from 'clsx';
import styles from './UITag.module.css';

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
  // Preset *status* names (not raw hex/CSS-var values) — Ant Design resolves these
  // through the Tag component's own theme tokens (see theme-adapter.ts `Tag: {...}`),
  // which are plain `var(--x)` strings. Passing a *computed* useToken() color instead
  // sends it through Ant's derivation pipeline, which runs TinyColor over the raw
  // `var(--x)` string, fails to parse it, and silently falls back to black.
  const colorMap: Record<UITagVariant, string | undefined> = {
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'processing',
    default: undefined,
    neutral: undefined,
  };

  const combinedClassName = clsx(
    styles['kb-ui-tag'],
    onClick && styles['kb-ui-tag--clickable'],
    className,
  );

  return (
    <AntTag
      color={color ?? colorMap[variant]}
      closable={closable}
      onClose={onClose}
      icon={icon}
      className={combinedClassName}
      onClick={onClick}
      {...rest}
    >
      {children}
    </AntTag>
  );
}
