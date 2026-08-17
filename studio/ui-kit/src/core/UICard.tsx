/**
 * UICard component - Card container with header/footer
 *
 * Wraps Ant Design Card with additional features.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Card as AntCard, theme } from 'antd';
import type { CardProps as AntCardProps } from 'antd';
import clsx from 'clsx';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import styles from './UICard.module.css';

const { useToken } = theme;

export type UICardVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

// Status reads as a short accent bar at the top-left, not a full-width border —
// distinctive enough to scan at a glance without tinting the whole card.
const variantTokens: Record<UICardVariant, { accent: string }> = {
  default: { accent: 'var(--border-primary)' },
  success: { accent: 'var(--success)' },
  warning: { accent: 'var(--warning)' },
  error:   { accent: 'var(--error)' },
  info:    { accent: 'var(--info)' },
};

export interface UICardProps extends Omit<AntCardProps, 'title' | 'bordered'> {
  /** Card title */
  title?: React.ReactNode;
  /** Subtitle (below title) */
  subtitle?: string;
  /** Extra content (top-right corner) */
  extra?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Card content */
  children: React.ReactNode;
  /** Card size */
  size?: 'small' | 'default';
  /** Show border — false maps to variant="borderless" */
  bordered?: boolean;
  /** Hoverable effect */
  hoverable?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Status variant — adds colored top border + tinted background */
  status?: UICardVariant;
}

/**
 * UICard - Container with optional header/footer
 *
 * @example
 * ```tsx
 * <UICard title="User Profile" subtitle="Last updated today">
 *   <p>Card content</p>
 * </UICard>
 *
 * <UICard
 *   title="Analytics"
 *   extra={<Button>View All</Button>}
 *   footer={<p>Last 7 days</p>}
 * >
 *   <MetricChart />
 * </UICard>
 * ```
 */
export function UICard({
  title,
  subtitle,
  extra,
  footer,
  children,
  size = 'default',
  bordered = true,
  hoverable = false,
  loading = false,
  status = 'default',
  ...rest
}: UICardProps) {
  const { token } = useToken();
  const vt = variantTokens[status];

  // Custom title with subtitle
  const cardTitle = (title || subtitle) ? (
    <UIBox>
      {title && (typeof title === 'string'
        ? <UIText size="lg" weight="semibold" as="div">{title}</UIText>
        : title
      )}
      {subtitle && (
        <UIText size="sm" color="secondary" as="div" style={{ marginTop: token.marginXXS }}>
          {subtitle}
        </UIText>
      )}
    </UIBox>
  ) : undefined;

  return (
    <AntCard
      title={cardTitle}
      extra={extra}
      size={size}
      variant={bordered ? 'outlined' : 'borderless'}
      hoverable={false}
      loading={loading}
      {...rest}
      className={clsx(
        styles.card,
        hoverable && styles.hoverable,
        status !== 'default' && styles.accented,
        rest.className,
      )}
      style={{
        borderColor: token.colorBorder,
        overflow: 'hidden',
        '--card-accent': vt.accent,
        ...rest.style,
      } as React.CSSProperties}
    >
      {children}
      {footer && (
        <UIBox mt={3} pt={3} style={{ borderTop: `1px solid ${token.colorBorder}` }}>
          {footer}
        </UIBox>
      )}
    </AntCard>
  );
}
