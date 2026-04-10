/**
 * UINotification - Imperative notification API
 *
 * Wraps antd's notification API to decouple app from antd internals.
 *
 * @example
 * ```tsx
 * import { UINotification } from '@kb-labs/studio-ui-kit';
 *
 * UINotification.success({ message: 'Done', description: 'Task completed.' });
 * ```
 */

import { notification } from 'antd';

export interface UINotificationArgs {
  message: React.ReactNode;
  description?: React.ReactNode;
  key?: React.Key;
  duration?: number | null;
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
  icon?: React.ReactNode;
  btn?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onClose?: () => void;
}

type NotifyFunc = (args: UINotificationArgs) => void;

export interface UINotificationAPI {
  success: NotifyFunc;
  error: NotifyFunc;
  info: NotifyFunc;
  warning: NotifyFunc;
  open: NotifyFunc;
  destroy: (key?: React.Key) => void;
}

export const UINotification: UINotificationAPI = notification as unknown as UINotificationAPI;

export function useUINotification() {
  return notification.useNotification();
}
