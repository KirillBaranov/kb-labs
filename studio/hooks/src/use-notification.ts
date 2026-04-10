import { useCallback } from 'react';
import { notification } from 'antd';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface UseNotificationReturn {
  notify: (options: {
    type: NotificationType;
    message: string;
    description?: string;
    duration?: number;
  }) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

/**
 * Notification hook for plugin pages.
 *
 * @example
 * ```tsx
 * const notify = useNotification();
 * notify.success('Commit created');
 * notify.error('Build failed', 'Check logs for details');
 * ```
 */
export function useNotification(): UseNotificationReturn {
  const notify = useCallback(
    (opts: { type: NotificationType; message: string; description?: string; duration?: number }) => {
      notification[opts.type]({
        message: opts.message,
        description: opts.description,
        duration: opts.duration ?? 4.5,
      });
    },
    [],
  );

  const success = useCallback(
    (message: string, description?: string) => notify({ type: 'success', message, description }),
    [notify],
  );
  const error = useCallback(
    (message: string, description?: string) => notify({ type: 'error', message, description }),
    [notify],
  );
  const warning = useCallback(
    (message: string, description?: string) => notify({ type: 'warning', message, description }),
    [notify],
  );
  const info = useCallback(
    (message: string, description?: string) => notify({ type: 'info', message, description }),
    [notify],
  );

  return { notify, success, error, warning, info };
}
