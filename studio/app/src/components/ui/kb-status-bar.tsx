import * as React from 'react';
import { Space, Tooltip, Badge } from 'antd';
import {
  ApiOutlined,
  CloudOutlined,
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import styles from './kb-status-bar.module.css';

export interface StatusBarItemProps {
  icon?: React.ReactNode;
  label: string;
  tooltip?: string;
  status?: 'success' | 'error' | 'warning' | 'processing' | 'default';
  onClick?: () => void;
  clickable?: boolean;
}

export function StatusBarItem({
  icon,
  label,
  tooltip,
  status,
  onClick,
  clickable = !!onClick,
}: StatusBarItemProps) {
  const content = (
    <div
      onClick={onClick}
      className={`${styles.item} ${clickable ? styles.clickable : ''}`}
    >
      {status && <Badge status={status} />}
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      <span>{label}</span>
    </div>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{content}</Tooltip>;
  }

  return content;
}

export interface KBStatusBarProps {
  leftItems?: React.ReactNode;
  rightItems?: React.ReactNode;
  children?: React.ReactNode;
}

export function KBStatusBar({ leftItems, rightItems, children }: KBStatusBarProps) {
  return (
    <div className={styles.bar}>
      {children ? (
        children
      ) : (
        <>
          <div className={styles.side}>
            <Space size={0}>{leftItems}</Space>
          </div>
          <div className={styles.side}>
            <Space size={0}>{rightItems}</Space>
          </div>
        </>
      )}
    </div>
  );
}

export const StatusBarPresets = {
  ApiConnection: ({ connected, onClick }: { connected: boolean; onClick?: () => void }) => (
    <StatusBarItem
      icon={<ApiOutlined />}
      label={connected ? 'Connected' : 'Disconnected'}
      status={connected ? 'success' : 'error'}
      tooltip={connected ? 'API connection active' : 'API connection lost'}
      onClick={onClick}
      clickable={!!onClick}
    />
  ),

  CloudStatus: ({ synced, onClick }: { synced: boolean; onClick?: () => void }) => (
    <StatusBarItem
      icon={<CloudOutlined />}
      label={synced ? 'Synced' : 'Syncing...'}
      status={synced ? 'success' : 'processing'}
      tooltip={synced ? 'All changes synced' : 'Syncing changes...'}
      onClick={onClick}
      clickable={!!onClick}
    />
  ),

  User: ({ email, onClick }: { email: string; onClick?: () => void }) => (
    <StatusBarItem
      icon={<UserOutlined />}
      label={email}
      tooltip="Current user"
      onClick={onClick}
      clickable={!!onClick}
    />
  ),

  Version: ({ version, onClick }: { version: string; onClick?: () => void }) => (
    <StatusBarItem
      label={`v${version}`}
      tooltip={`Platform version ${version}`}
      onClick={onClick}
      clickable={!!onClick}
    />
  ),

  Settings: ({ onClick }: { onClick: () => void }) => (
    <StatusBarItem
      icon={<SettingOutlined />}
      label="Settings"
      tooltip="Open settings"
      onClick={onClick}
      clickable
    />
  ),

  Help: ({ onClick }: { onClick: () => void }) => (
    <StatusBarItem
      icon={<QuestionCircleOutlined />}
      label="Help"
      tooltip="Get help"
      onClick={onClick}
      clickable
    />
  ),

  BackgroundJobs: ({ count, onClick }: { count: number; onClick?: () => void }) => (
    <StatusBarItem
      icon={<ThunderboltOutlined />}
      label={count === 1 ? '1 job running' : `${count} jobs running`}
      status="processing"
      tooltip="View background jobs"
      onClick={onClick}
      clickable={!!onClick}
    />
  ),
};
