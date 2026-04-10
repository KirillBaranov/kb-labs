/**
 * @module @kb-labs/studio-data-client/hooks/use-notifications
 * React hook for tracking critical log notifications
 */

import { useState, useEffect, useCallback } from 'react';
import type { ObservabilityDataSource } from '../sources/observability-source';
import type { LogRecord } from '../contracts/observability';

export interface LogNotification {
  id: string;
  timestamp: string;
  level: 'warn' | 'error';
  message: string;
  plugin?: string;
  executionId?: string;
  error?: {
    name: string;
    message: string;
  };
  read: boolean;
}

export interface UseNotificationsResult {
  notifications: LogNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  clearNotification: (id: string) => void;
}

const MAX_NOTIFICATIONS = 50;

/**
 * Hook to track critical log notifications (warn/error) from SSE stream
 *
 * Automatically subscribes to log stream and filters warn/error logs.
 * Maintains a list of recent critical logs with read/unread status.
 *
 * @param source - Observability data source
 * @param maxNotifications - Maximum number of notifications to keep (default: 50)
 */
export function useNotifications(
  source: ObservabilityDataSource,
  maxNotifications: number = MAX_NOTIFICATIONS
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<LogNotification[]>([]);

  useEffect(() => {
    return source.subscribeToLogs(
      (log: LogRecord) => {
        // Only track warn and error logs
        if (log.level !== 'warn' && log.level !== 'error') {
          return;
        }

        // Safely extract message (handle objects being passed as message)
        let messageText = 'No message';
        if (log.msg) {
          messageText = typeof log.msg === 'string' ? log.msg : JSON.stringify(log.msg);
        }

        const notification: LogNotification = {
          id: log.id || `${log.time}-${Math.random().toString(36).slice(2, 9)}`, // Use log.id from database, fallback to generated
          timestamp: log.time,
          level: log.level,
          message: messageText,
          plugin: log.plugin,
          executionId: log.executionId,
          error: log.err
            ? {
                name: String(log.err.name || 'Error'),
                message: String(log.err.message || 'Unknown error'),
              }
            : undefined,
          read: false,
        };

        setNotifications((prev) => [notification, ...prev].slice(0, maxNotifications));
      },
      (err) => {
        console.error('Notifications SSE error:', err);
      }
    );
  }, [source, maxNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    clearNotification,
  };
}
