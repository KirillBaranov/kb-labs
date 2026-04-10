/**
 * Text component - Typography primitive with design tokens
 *
 * Uses tokens from @kb-labs/studio-ui-core for consistent styling.
 * NO inline styles, NO hardcoded colors.
 */

import * as React from 'react';
import { theme } from 'antd';
import { typography } from '@kb-labs/studio-ui-core';

const { useToken } = theme;

export type UITextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
export type UITextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
export type UITextColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export interface UITextProps {
  /** Text content */
  children: React.ReactNode;
  /** Typography size from design tokens */
  size?: UITextSize;
  /** Font weight from design tokens */
  weight?: UITextWeight;
  /** Semantic color using Ant Design tokens */
  color?: UITextColor;
  /** HTML element to render */
  as?: 'span' | 'p' | 'div' | 'label' | 'pre';
  /** Additional CSS class */
  className?: string;
  /** Additional styles (use sparingly) */
  style?: React.CSSProperties;
}

/**
 * UIText component with design system tokens
 *
 * @example
 * ```tsx
 * <UIText size="sm" color="secondary">Label text</UIText>
 * <UIText size="2xl" weight="bold">Heading</UIText>
 * ```
 */
export function UIText({
  children,
  size = 'base',
  weight = 'normal',
  color = 'primary',
  as: Component = 'span',
  className,
  style: customStyle,
}: UITextProps) {
  const { token } = useToken();

  // Map semantic colors to Ant Design tokens
  const colorMap: Record<UITextColor, string> = {
    primary: token.colorText,
    secondary: token.colorTextSecondary,
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
    info: token.colorInfo,
  };

  const baseStyle: React.CSSProperties = {
    fontSize: typography.fontSize[size][0],
    lineHeight: typography.fontSize[size][1].lineHeight,
    fontWeight: typography.fontWeight[weight],
    color: colorMap[color],
  };

  // Merge base styles with custom styles (custom styles override)
  const style = { ...baseStyle, ...customStyle };

  return (
    <Component style={style} className={className}>
      {children}
    </Component>
  );
}
