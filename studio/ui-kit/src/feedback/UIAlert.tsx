/**
 * UIAlert component - Alert messages and notifications
 *
 * Wraps Ant Design Alert with semantic variants.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Alert as AntAlert } from 'antd';

export type UIAlertVariant = 'success' | 'info' | 'warning' | 'error';

export interface UIAlertProps {
  /** Alert variant */
  variant?: UIAlertVariant;
  /** Alert title */
  title?: string;
  /** Alert message */
  message: React.ReactNode;
  /** Alert description */
  description?: React.ReactNode;
  /** Show icon */
  showIcon?: boolean;
  /** Closable alert */
  closable?: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Action button */
  action?: React.ReactNode;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIAlert - Alert message
 *
 * @example
 * ```tsx
 * <UIAlert variant="success" message="Success message" />
 *
 * <UIAlert
 *   variant="error"
 *   title="Error"
 *   message="Something went wrong"
 *   description="Please try again later"
 *   showIcon
 *   closable
 * />
 *
 * <UIAlert
 *   variant="warning"
 *   message="Warning"
 *   action={<UIButton size="small">Action</UIButton>}
 * />
 * ```
 */
export function UIAlert({
  variant = 'info',
  title,
  message,
  description,
  showIcon,
  closable,
  onClose,
  action,
  icon,
  className,
  style,
}: UIAlertProps) {
  return (
    <AntAlert
      type={variant}
      message={title || message}
      description={title ? description || message : description}
      showIcon={showIcon}
      closable={closable}
      onClose={onClose}
      action={action}
      icon={icon}
      className={className}
      style={style}
    />
  );
}
