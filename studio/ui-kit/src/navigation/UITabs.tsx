/**
 * UITabs component - Tabbed navigation
 *
 * Wraps Ant Design Tabs with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 *
 * syncUrl modes:
 *  - "search" — syncs with ?tab= query param (for pages at a fixed path, e.g. /)
 *  - "path"   — syncs with /:tab path segment via navigate (for pages like /settings/:tab)
 */

import * as React from 'react';
import { Tabs as AntTabs } from 'antd';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';

export interface UITabItem {
  /** Tab key */
  key: string;
  /** Tab label */
  label: string;
  /** Tab icon */
  icon?: React.ReactNode;
  /** Tab content */
  children: React.ReactNode;
  /** Disabled tab */
  disabled?: boolean;
  /** Closable tab */
  closable?: boolean;
}

export interface UITabsProps {
  /** Tab items */
  items: UITabItem[];
  /**
   * Sync active tab with URL automatically.
   * - true / "search" — uses ?tab= query param, default tab = first item (clean URL)
   * - { mode: "path", basePath } — uses /:tab path segment (e.g. "/settings")
   */
  syncUrl?: boolean | 'search' | { mode: 'path'; basePath: string };
  /** Controlled active tab key (ignored when syncUrl is set) */
  activeKey?: string;
  /** Default active tab key */
  defaultActiveKey?: string;
  /** Tab position */
  tabPosition?: 'top' | 'right' | 'bottom' | 'left';
  /** Tab type */
  type?: 'line' | 'card';
  /** Tab size */
  size?: 'small' | 'middle' | 'large';
  /** Change handler (called in addition to URL sync) */
  onChange?: (activeKey: string) => void;
  /** Tab edit handler (for closable tabs) */
  onEdit?: (targetKey: string, action: 'add' | 'remove') => void;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

function UITabsInner({
  items,
  syncUrl,
  activeKey: controlledActiveKey,
  defaultActiveKey,
  tabPosition = 'top',
  type = 'line',
  size = 'middle',
  onChange,
  onEdit,
  className,
  style,
}: UITabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();

  const defaultKey = items[0]?.key ?? '';

  let activeKey: string | undefined = controlledActiveKey;

  const isSearch = syncUrl === true || syncUrl === 'search';
  const isPath = syncUrl && typeof syncUrl === 'object' && syncUrl.mode === 'path';

  if (isSearch) {
    activeKey = searchParams.get('tab') ?? defaultKey;
  } else if (isPath) {
    activeKey = params.tab ?? defaultKey;
  }

  const handleChange = (key: string) => {
    if (isSearch) {
      setSearchParams(key === defaultKey ? {} : { tab: key });
    } else if (isPath && typeof syncUrl === 'object') {
      const path = key === defaultKey ? syncUrl.basePath : `${syncUrl.basePath}/${key}`;
      navigate(path);
    }
    onChange?.(key);
  };

  const tabItems = items.map((item) => ({
    key: item.key,
    label: item.icon ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {item.icon}
        <span>{item.label}</span>
      </span>
    ) : item.label,
    children: item.children,
    disabled: item.disabled,
    closable: item.closable,
  }));

  const handleEdit = onEdit
    ? (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
        const key = typeof targetKey === 'string' ? targetKey : '';
        onEdit(key, action);
      }
    : undefined;

  return (
    <AntTabs
      items={tabItems}
      activeKey={activeKey}
      defaultActiveKey={syncUrl ? undefined : defaultActiveKey}
      tabPosition={tabPosition}
      type={type}
      size={size}
      onChange={handleChange}
      onEdit={handleEdit}
      className={className}
      style={style}
    />
  );
}

export function UITabs(props: UITabsProps) {
  return <UITabsInner {...props} />;
}
