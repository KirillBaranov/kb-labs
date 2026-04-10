/**
 * UIPageHeader component - Standard page header
 *
 * Handles title, description, breadcrumbs, actions, back button, icon, tabs.
 * NO hardcoded colors — all via useToken().
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIButton } from '../core/UIButton';
import { UIIcon } from '../core/UIIcon';
import { UIBreadcrumb } from '../navigation/UIBreadcrumb';
import { UIDivider } from '../layout/UIDivider';
import { UIText } from '../primitives/UIText';

const { useToken } = theme;

export interface UIPageBreadcrumbItem {
  title: string;
  href?: string;
}

export interface UIPageHeaderProps {
  /** Page title */
  title: string | React.ReactNode;
  /** Subtitle below title */
  description?: string | React.ReactNode;
  /** Icon displayed left of title */
  icon?: React.ReactNode;
  /** Breadcrumb trail above title */
  breadcrumbs?: UIPageBreadcrumbItem[];
  /** Actions slot — right side (buttons, menus, etc.) */
  actions?: React.ReactNode;
  /** Tabs slot — rendered below divider */
  tabs?: React.ReactNode;
  /** Back button handler — renders ← button */
  onBack?: () => void;
  /** Escape hatch for custom content below description */
  children?: React.ReactNode;
}

/**
 * UIPageHeader - Standard page header for Studio and plugins
 *
 * @example
 * ```tsx
 * <UIPageHeader
 *   title="Release Manager"
 *   description="Manage deployments and releases"
 *   breadcrumbs={[{ title: 'Plugins' }, { title: 'Release Manager' }]}
 *   actions={<UIButton variant="primary">Deploy</UIButton>}
 *   onBack={() => navigate(-1)}
 * />
 *
 * <UIPageHeader
 *   title="Settings"
 *   tabs={<UITabs items={tabItems} />}
 * />
 * ```
 */
export function UIPageHeader({
  title,
  description,
  icon,
  breadcrumbs,
  actions,
  tabs,
  onBack,
  children,
}: UIPageHeaderProps) {
  const { token } = useToken();

  const hasTabs = !!tabs;

  return (
    <div style={{ marginBottom: hasTabs ? 0 : 24 }}>
      {/* Back button + Breadcrumbs row */}
      {(onBack || (breadcrumbs && breadcrumbs.length > 0)) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: token.marginXS,
            marginBottom: token.marginXS,
          }}
        >
          {onBack && (
            <UIButton
              variant="text"
              size="small"
              icon={<UIIcon name="ArrowLeftOutlined" />}
              onClick={onBack}
              style={{ padding: '0 4px' }}
            />
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <UIBreadcrumb
              items={breadcrumbs.map((item) => ({
                title: item.title,
                ...(item.href ? { href: item.href } : {}),
              }))}
            />
          )}
        </div>
      )}

      {/* Title row: icon + title + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: token.marginSM,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: token.marginSM, minWidth: 0 }}>
          {icon && (
            <span
              style={{
                fontSize: 24,
                color: token.colorPrimary,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {icon}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            {typeof title === 'string' ? (
              <h2
                style={{
                  margin: 0,
                  fontSize: token.fontSizeHeading3,
                  fontWeight: token.fontWeightStrong,
                  color: token.colorTextHeading,
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h2>
            ) : (
              title
            )}
            {description && (
              <div style={{ marginTop: 4 }}>
                {typeof description === 'string' ? (
                  <UIText color="secondary" size="sm">
                    {description}
                  </UIText>
                ) : (
                  description
                )}
              </div>
            )}
          </div>
        </div>

        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: token.marginXS, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>

      {/* Escape hatch children */}
      {children && <div style={{ marginTop: token.marginSM }}>{children}</div>}

      {/* Tabs with divider */}
      {hasTabs && (
        <>
          <UIDivider style={{ marginBottom: 0 }} />
          {tabs}
        </>
      )}
    </div>
  );
}
