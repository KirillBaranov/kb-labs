import * as React from 'react';
import { Layout, Menu, Dropdown, Avatar, type MenuProps } from 'antd';
import { PanelLeftClose, PanelLeftOpen, User, ChevronsUpDown } from 'lucide-react';
import { UIButton } from '@kb-labs/studio-ui-kit';
import { KBThemeToggle } from './kb-theme-toggle';
import { KBNotificationBell, type LogNotification } from './kb-notification-bell';
import styles from './kb-sidebar.module.css';

const { Sider: AntSider } = Layout;

export interface NavigationItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  path?: string;
  children?: NavigationItem[];
  type?: 'group' | 'divider';
}

export interface KBSidebarProps {
  items: NavigationItem[];
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  width?: number;
  collapsedWidth?: number;
  currentPath?: string;
  onNavigate?: (path: string) => void;

  // Brand
  logo?: React.ReactNode;
  logoLink?: string;
  LinkComponent?: React.ComponentType<{ to: string; children: React.ReactNode; className?: string }>;

  // Identity (was header)
  onLogout?: () => void;
  profileMenuItems?: MenuProps['items'];
  userAvatar?: string;
  userName?: string;

  // Notifications (was header)
  notifications?: LogNotification[];
  unreadNotificationsCount?: number;
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onClearAllNotifications?: () => void;
  onClearNotification?: (id: string) => void;
  onNotificationClick?: (notification: LogNotification) => void;
}

export function KBSidebar({
  items,
  collapsed: controlledCollapsed,
  onCollapse,
  width = 220,
  collapsedWidth = 64,
  currentPath,
  onNavigate,
  logo = 'KB Labs',
  logoLink = '/',
  LinkComponent,
  onLogout,
  profileMenuItems,
  userAvatar,
  userName = 'User',
  notifications = [],
  unreadNotificationsCount = 0,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onClearAllNotifications,
  onClearNotification,
  onNotificationClick,
}: KBSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const setCollapsed = React.useCallback(
    (newCollapsed: boolean) => {
      if (controlledCollapsed === undefined) {
        setInternalCollapsed(newCollapsed);
      }
      onCollapse?.(newCollapsed);
    },
    [controlledCollapsed, onCollapse]
  );

  const keyToPathMap = React.useMemo(() => {
    const map = new Map<string, string>();
    const buildMap = (navItems: NavigationItem[]) => {
      for (const item of navItems) {
        if (item.path && item.key) {
          map.set(item.key, item.path);
        }
        if (item.children) {
          buildMap(item.children);
        }
      }
    };
    buildMap(items);
    return map;
  }, [items]);

  const menuItems: MenuProps['items'] = React.useMemo(() => {
    const convertItems = (navItems: NavigationItem[]): MenuProps['items'] => {
      return navItems.map((item) => {
        const hasChildren = item.children && item.children.length > 0;

        if (item.type === 'divider') {
          return { type: 'divider' as const, key: item.key };
        }

        if (item.type === 'group' && hasChildren) {
          return {
            type: 'group' as const,
            key: item.key,
            label: item.label,
            children: convertItems(item.children!),
          };
        }

        const menuItem: any = {
          key: item.key,
          icon: item.icon,
          label: item.label,
        };

        if (hasChildren && item.children) {
          menuItem.children = convertItems(item.children);
        }

        return menuItem;
      });
    };

    return convertItems(items);
  }, [items]);

  const selectedKeys = React.useMemo(() => {
    if (!currentPath) { return []; }

    const findKeys = (path: string, navItems: NavigationItem[]): string[] => {
      for (const item of navItems) {
        if (item.path === path) {
          return [item.key || item.path || `item-${Math.random()}`];
        }
        if (item.children?.length) {
          const childKeys = findKeys(path, item.children);
          if (childKeys.length > 0) {return childKeys;}
        }
      }
      for (const item of navItems) {
        if (item.path && !item.children?.length && path.startsWith(item.path + '/')) {
          return [item.key || item.path || `item-${Math.random()}`];
        }
      }
      return [];
    };

    return findKeys(currentPath, items);
  }, [currentPath, items]);

  const openKeys = React.useMemo(() => {
    if (!currentPath) { return []; }

    const findOpenKeys = (path: string, navItems: NavigationItem[]): string[] => {
      for (const item of navItems) {
        if (item.children) {
          const childKeys = findOpenKeys(path, item.children);
          if (childKeys.length > 0) {
            return [item.key || item.path || `item-${Math.random()}`, ...childKeys];
          }
        }
      }
      return [];
    };

    return findOpenKeys(currentPath, items);
  }, [currentPath, items]);

  const handleMenuClick = (e: { key: string }) => {
    const path = keyToPathMap.get(e.key);
    if (path && onNavigate) {
      onNavigate(path);
    }
  };

  const mainItems = (menuItems ?? []).filter((item: any) => item?.key !== 'settings');
  const settingsItems = (menuItems ?? []).filter((item: any) => item?.key === 'settings');

  const profileItems: MenuProps['items'] = profileMenuItems || [
    ...(onLogout ? [{ key: 'logout', label: 'Logout', danger: true, onClick: onLogout }] : []),
  ];

  const hasNotifications =
    onMarkNotificationAsRead && onMarkAllNotificationsAsRead && onClearAllNotifications && onClearNotification;

  return (
    <AntSider
      collapsible
      collapsed={collapsed}
      width={width}
      collapsedWidth={collapsedWidth}
      trigger={null}
      className={styles.sider}
      theme="light"
    >
      <Dropdown menu={{ items: profileItems }} placement="bottomLeft">
        <button
          type="button"
          className={[styles.profileCard, collapsed && styles.profileCardCollapsed].filter(Boolean).join(' ')}
        >
          <Avatar size={30} icon={!userAvatar && <User size={14} />} src={userAvatar} />
          {!collapsed && (
            <>
              <div className={styles.profileMeta}>
                <span className={styles.profileName}>{userName}</span>
                <span className={styles.profileStatus}>
                  <span className={styles.profileStatusDot} />
                  Online
                </span>
              </div>
              <ChevronsUpDown size={14} className={styles.profileChevron} />
            </>
          )}
        </button>
      </Dropdown>

      <div className={styles.scrollArea}>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={mainItems}
          onClick={handleMenuClick}
          className={styles.menu}
        />
      </div>

      <div className={styles.bottomStack}>
        {settingsItems.length > 0 && (
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            items={settingsItems}
            onClick={handleMenuClick}
            className={styles.menu}
          />
        )}

        <div className={styles.utilityRow}>
          {LinkComponent ? (
            <LinkComponent to={logoLink} className={styles.brandMark}>
              {typeof logo === 'string' ? logo.slice(0, 1) : logo}
            </LinkComponent>
          ) : (
            <a href={logoLink} className={styles.brandMark}>
              {typeof logo === 'string' ? logo.slice(0, 1) : logo}
            </a>
          )}

          {hasNotifications && (
            <KBNotificationBell
              notifications={notifications}
              unreadCount={unreadNotificationsCount}
              onMarkAsRead={onMarkNotificationAsRead!}
              onMarkAllAsRead={onMarkAllNotificationsAsRead!}
              onClearAll={onClearAllNotifications!}
              onClearNotification={onClearNotification!}
              onNotificationClick={onNotificationClick}
            />
          )}
          <KBThemeToggle />

          <UIButton
            variant="text"
            className={styles.collapseButton}
            icon={collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
      </div>
    </AntSider>
  );
}
