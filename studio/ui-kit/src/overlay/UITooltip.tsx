/**
 * UITooltip component - Tooltip overlay
 *
 * Wraps Ant Design Tooltip with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Tooltip as AntTooltip } from 'antd';

export type UITooltipPlacement =
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

export interface UITooltipProps {
  /** Tooltip content */
  title: React.ReactNode;
  /** Element to attach tooltip to */
  children: React.ReactNode;
  /** Tooltip placement */
  placement?: UITooltipPlacement;
  /** Show arrow */
  arrow?: boolean;
  /** Trigger mode */
  trigger?: 'hover' | 'focus' | 'click';
  /** Show/hide controlled */
  open?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * UITooltip - Tooltip overlay
 *
 * @example
 * ```tsx
 * <UITooltip title="Click to save">
 *   <UIButton>Save</UIButton>
 * </UITooltip>
 *
 * <UITooltip title="Additional information" placement="right">
 *   <InfoIcon />
 * </UITooltip>
 *
 * <UITooltip title="Detailed help text" trigger="click">
 *   <HelpIcon />
 * </UITooltip>
 * ```
 */
export function UITooltip({
  title,
  children,
  placement = 'top',
  arrow = true,
  trigger = 'hover',
  open,
  className,
}: UITooltipProps) {
  return (
    <AntTooltip
      title={title}
      placement={placement}
      arrow={arrow}
      trigger={trigger}
      open={open}
      className={className}
    >
      {children}
    </AntTooltip>
  );
}
