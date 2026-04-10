import * as React from 'react';
import { Layout, Dropdown, Avatar, type MenuProps } from 'antd';
import { User, Search } from 'lucide-react';
import { UIButton } from '@kb-labs/studio-ui-kit';
import { KBThemeToggle } from './kb-theme-toggle';
import { type SystemHealthData } from './kb-system-health-indicator';
import { KBNotificationBell, type LogNotification } from './kb-notification-bell';
import styles from './kb-header.module.css';

const { Header: AntHeader } = Layout;

export interface KBHeaderProps {
  logo?: React.ReactNode;
  logoLink?: string;
  LinkComponent?: React.ComponentType<{ to: string; children: React.ReactNode; className?: string }>;
  onLogout?: () => void;
  profileMenuItems?: MenuProps['items'];
  userAvatar?: string;
  userName?: string;
  systemHealth?: SystemHealthData;
  systemHealthLoading?: boolean;
  onSearchClick?: () => void;
  sidebarCollapsed?: boolean;
  onSidebarCollapse?: (collapsed: boolean) => void;
  sidebarWidth?: number;
  notifications?: LogNotification[];
  unreadNotificationsCount?: number;
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onClearAllNotifications?: () => void;
  onClearNotification?: (id: string) => void;
  onNotificationClick?: (notification: LogNotification) => void;
}

export function KBHeader({
  logo = 'KB Labs',
  logoLink = '/',
  LinkComponent,
  onLogout,
  profileMenuItems,
  userAvatar,
  userName = 'User',
  onSearchClick,
  sidebarWidth = 220,
  notifications = [],
  unreadNotificationsCount = 0,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onClearAllNotifications,
  onClearNotification,
  onNotificationClick,
}: KBHeaderProps) {
  const profileItems: MenuProps['items'] = profileMenuItems || [
    ...(onLogout ? [{ key: 'logout', label: 'Logout', danger: true, onClick: onLogout }] : []),
  ];

  return (
    <AntHeader
      className={styles.header}
      style={{ paddingLeft: sidebarWidth + 16 }}
    >
      {LinkComponent ? (
        <LinkComponent to={logoLink} className={styles.logo}>
          {logo}
        </LinkComponent>
      ) : (
        <a href={logoLink} className={styles.logo}>
          {logo}
        </a>
      )}

      <div className={styles.actions}>
        {onSearchClick && (
          <UIButton
            variant="text"
            icon={<Search size={16} />}
            onClick={onSearchClick}
            className={styles.actionBtn}
          />
        )}

        {onMarkNotificationAsRead &&
          onMarkAllNotificationsAsRead &&
          onClearAllNotifications &&
          onClearNotification && (
            <KBNotificationBell
              notifications={notifications}
              unreadCount={unreadNotificationsCount}
              onMarkAsRead={onMarkNotificationAsRead}
              onMarkAllAsRead={onMarkAllNotificationsAsRead}
              onClearAll={onClearAllNotifications}
              onClearNotification={onClearNotification}
              onNotificationClick={onNotificationClick}
            />
          )}

        <KBThemeToggle />

        <Dropdown menu={{ items: profileItems }} placement="bottomRight">
          <UIButton variant="text" className={styles.userBtn}>
            <Avatar
              size={20}
              icon={!userAvatar && <User size={12} />}
              src={userAvatar}
            />
            {userName && <span className={styles.userName}>{userName}</span>}
          </UIButton>
        </Dropdown>
      </div>
    </AntHeader>
  );
}
