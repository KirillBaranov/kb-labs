import * as React from 'react';
import { Badge, Dropdown, List, Typography, Tag, Empty, Space, Tooltip } from 'antd';
import { Bell, AlertTriangle, XCircle, X, CheckCheck } from 'lucide-react';
import { UIButton } from '@kb-labs/studio-ui-kit';
import styles from './kb-notification-bell.module.css';

const { Text, Paragraph } = Typography;

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

export interface KBNotificationBellProps {
  notifications: LogNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onClearNotification: (id: string) => void;
  onNotificationClick?: (notification: LogNotification) => void;
}

export function KBNotificationBell({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onClearNotification,
  onNotificationClick,
}: KBNotificationBellProps) {
  const [open, setOpen] = React.useState(false);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) { return 'Just now'; }
    if (diffMins < 60) { return `${diffMins}m ago`; }
    if (diffHours < 24) { return `${diffHours}h ago`; }
    return `${diffDays}d ago`;
  };

  const getLevelIcon = (level: 'warn' | 'error') => {
    if (level === 'error') {
      return <XCircle size={16} style={{ color: 'var(--error)' }} />;
    }
    return <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />;
  };

  const getLevelColor = (level: 'warn' | 'error') => {
    return level === 'error' ? 'red' : 'orange';
  };

  const notificationContent = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <Space>
          <Text strong>Notifications</Text>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: 'var(--error)' }} />
          )}
        </Space>
        <Space size="small">
          {notifications.length > 0 && (
            <>
              <Tooltip title="Mark all as read">
                <UIButton
                  variant="text"
                  size="small"
                  icon={<CheckCheck size={14} />}
                  onClick={(e) => { e.stopPropagation(); onMarkAllAsRead(); }}
                />
              </Tooltip>
              <Tooltip title="Clear all">
                <UIButton
                  variant="text"
                  size="small"
                  danger
                  icon={<X size={14} />}
                  onClick={(e) => { e.stopPropagation(); onClearAll(); }}
                />
              </Tooltip>
            </>
          )}
        </Space>
      </div>

      <div className={styles.panelList}>
        {notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No critical logs" />
          </div>
        ) : (
          <List
            dataSource={notifications}
            renderItem={(notification) => (
              <div
                className={`${styles.notifItem} ${!notification.read ? styles.unread : ''}`}
                onClick={() => {
                  if (!notification.read) { onMarkAsRead(notification.id); }
                  if (onNotificationClick) {
                    setOpen(false);
                    onNotificationClick(notification);
                  }
                }}
              >
                <div className={styles.notifRow}>
                  <div className={styles.notifIcon}>{getLevelIcon(notification.level)}</div>
                  <div className={styles.notifBody}>
                    <div className={styles.notifMeta}>
                      <Tag color={getLevelColor(notification.level)} style={{ margin: 0 }}>
                        {notification.level.toUpperCase()}
                      </Tag>
                      {notification.plugin && (
                        <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                          {notification.plugin}
                        </Tag>
                      )}
                      <Text type="secondary" className={styles.notifTime} style={{ fontSize: 11 }}>
                        {formatTimestamp(notification.timestamp)}
                      </Text>
                    </div>
                    <Paragraph className={styles.notifMessage} ellipsis={{ rows: 2 }}>
                      {notification.error && typeof notification.error === 'object'
                        ? `${notification.error.name || 'Error'}: ${notification.error.message || 'Unknown error'}`
                        : notification.message || 'No message'}
                    </Paragraph>
                    {notification.executionId && (
                      <Text type="secondary" className={styles.notifExecId}>
                        exec: {notification.executionId.slice(0, 8)}
                      </Text>
                    )}
                  </div>
                  <div className={styles.notifClear}>
                    <UIButton
                      variant="text"
                      size="small"
                      icon={<X size={12} />}
                      onClick={(e) => { e.stopPropagation(); onClearNotification(notification.id); }}
                    />
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {notifications.length > 0 && (
        <div className={styles.panelFooter}>
          <UIButton
            variant="link"
            size="small"
            onClick={() => {
              setOpen(false);
              window.location.href = '/observability/logs';
            }}
          >
            View all logs →
          </UIButton>
        </div>
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      popupRender={() => notificationContent}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge count={unreadCount} offset={[-2, 2]} size="small">
        <UIButton
          variant="text"
          icon={<Bell size={18} />}
          className={styles.bell}
          style={unreadCount > 0 ? { color: 'var(--error)' } : undefined}
        />
      </Badge>
    </Dropdown>
  );
}
