/**
 * UIBreadcrumb component - Navigation breadcrumb trail
 *
 * Wraps Ant Design Breadcrumb with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Breadcrumb as AntBreadcrumb } from 'antd';

export interface UIBreadcrumbItem {
  /** Breadcrumb text */
  title: string;
  /** Optional link href */
  href?: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Click handler (if no href) */
  onClick?: () => void;
}

export interface UIBreadcrumbProps {
  /** Breadcrumb items */
  items: UIBreadcrumbItem[];
  /** Custom separator */
  separator?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
}

/**
 * UIBreadcrumb - Navigation breadcrumb
 *
 * @example
 * ```tsx
 * <UIBreadcrumb
 *   items={[
 *     { title: 'Home', href: '/' },
 *     { title: 'Workflows', href: '/workflows' },
 *     { title: 'Details' },
 *   ]}
 * />
 *
 * <UIBreadcrumb
 *   items={[
 *     { title: 'Dashboard', icon: <HomeIcon /> },
 *     { title: 'Settings', onClick: () => navigate('/settings') },
 *   ]}
 *   separator=">"
 * />
 * ```
 */
export function UIBreadcrumb({
  items,
  separator,
  className,
}: UIBreadcrumbProps) {
  const breadcrumbItems = items.map((item) => ({
    title: item.icon ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {item.icon}
        <span>{item.title}</span>
      </span>
    ) : item.title,
    href: item.href,
    onClick: item.onClick,
  }));

  return (
    <AntBreadcrumb
      items={breadcrumbItems}
      separator={separator}
      className={className}
    />
  );
}
