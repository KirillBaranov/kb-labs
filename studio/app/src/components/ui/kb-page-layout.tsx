import * as React from 'react';
import { Layout as AntLayout } from 'antd';
import { KBSidebar, type KBSidebarProps, type NavigationItem } from './kb-sidebar';
import styles from './kb-page-layout.module.css';

const { Content: AntContent } = AntLayout;

export interface KBPageLayoutProps {
  sidebarProps: Omit<KBSidebarProps, 'collapsed' | 'onCollapse'>;
  sidebarCollapsed?: boolean;
  onSidebarCollapse?: (collapsed: boolean) => void;
  statusBar?: React.ReactNode;
  children?: React.ReactNode;
}

export function KBPageLayout({
  sidebarProps,
  sidebarCollapsed,
  onSidebarCollapse,
  statusBar,
  children,
}: KBPageLayoutProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);

  const collapsed = sidebarCollapsed !== undefined ? sidebarCollapsed : internalCollapsed;
  const setCollapsed = React.useCallback(
    (newCollapsed: boolean) => {
      if (sidebarCollapsed === undefined) {
        setInternalCollapsed(newCollapsed);
      }
      onSidebarCollapse?.(newCollapsed);
    },
    [sidebarCollapsed, onSidebarCollapse]
  );

  const sidebarWidth = collapsed ? (sidebarProps.collapsedWidth || 64) : (sidebarProps.width || 220);

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <KBSidebar {...sidebarProps} collapsed={collapsed} onCollapse={setCollapsed} />
      <AntLayout
        style={{
          marginLeft: sidebarWidth,
          transition: 'margin-left 0.2s',
          minHeight: '100vh',
          paddingBottom: statusBar ? 28 : 0,
        }}
      >
        <AntContent className={styles.content}>{children}</AntContent>
      </AntLayout>
      {statusBar}
    </AntLayout>
  );
}

export type { KBSidebarProps, NavigationItem };
