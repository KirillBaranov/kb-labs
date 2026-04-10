/**
 * UICard component - Card container with header/footer
 *
 * Wraps Ant Design Card with additional features.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Card as AntCard, theme } from 'antd';
import type { CardProps as AntCardProps } from 'antd';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';

const { useToken } = theme;

export type UICardVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const variantTokens: Record<UICardVariant, { tint: string; accent: string; border: string }> = {
  default:  { tint: 'transparent',               accent: 'transparent',  border: 'var(--border-primary, #e8eaed)' },
  success:  { tint: 'rgba(82,196,26,0.07)',       accent: '#52c41a',      border: 'rgba(82,196,26,0.25)' },
  warning:  { tint: 'rgba(250,173,20,0.08)',      accent: '#faad14',      border: 'rgba(250,173,20,0.30)' },
  error:    { tint: 'rgba(255,77,79,0.07)',       accent: '#ff4d4f',      border: 'rgba(255,77,79,0.25)' },
  info:     { tint: 'rgba(12,102,255,0.07)',      accent: '#0c66ff',      border: 'rgba(12,102,255,0.20)' },
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
      hoverable={hoverable}
      loading={loading}
      {...rest}
      style={{
        boxShadow: hoverable ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 200ms ease, transform 200ms ease',
        backgroundColor: status !== 'default' ? vt.tint : undefined,
        borderColor: vt.border,
        borderTopColor: status !== 'default' ? vt.accent : vt.border,
        borderTopWidth: status !== 'default' ? 3 : 1,
        overflow: 'hidden',
        ...rest.style,
      }}
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
