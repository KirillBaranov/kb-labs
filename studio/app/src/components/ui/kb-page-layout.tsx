import * as React from 'react';
import { Layout as AntLayout } from 'antd';
import { KBHeader, type KBHeaderProps } from './kb-header';
import { KBSidebar, type KBSidebarProps, type NavigationItem } from './kb-sidebar';

const { Content: AntContent } = AntLayout;

export interface KBPageLayoutProps {
  headerProps?: KBHeaderProps;
  sidebarProps: Omit<KBSidebarProps, 'collapsed' | 'onCollapse'>;
  sidebarCollapsed?: boolean;
  onSidebarCollapse?: (collapsed: boolean) => void;
  statusBar?: React.ReactNode;
  children?: React.ReactNode;
}

export function KBPageLayout({
  headerProps,
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
      <KBHeader
        {...headerProps}
        sidebarCollapsed={collapsed}
        onSidebarCollapse={setCollapsed}
        sidebarWidth={sidebarWidth}
      />
      <AntLayout style={{ marginTop: 64 }}>
        <KBSidebar {...sidebarProps} collapsed={collapsed} onCollapse={setCollapsed} />
        <AntLayout
          style={{
            marginLeft: sidebarWidth,
            transition: 'margin-left 0.2s',
            minHeight: 'calc(100vh - 64px)',
            paddingBottom: statusBar ? 28 : 0,
          }}
        >
          <AntContent>{children}</AntContent>
        </AntLayout>
      </AntLayout>
      {statusBar}
    </AntLayout>
  );
}

export type { KBHeaderProps, KBSidebarProps, NavigationItem };
