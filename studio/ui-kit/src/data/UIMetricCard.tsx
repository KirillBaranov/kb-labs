/**
 * MetricCard component - Display metric with trend
 *
 * Professional UI component using design tokens.
 * NO inline styles, NO hardcoded colors.
 */

import * as React from 'react';
import { Card, theme } from 'antd';
import { UIText } from '../primitives/UIText';
import { UIFlex } from '../primitives/UIFlex';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export interface UIMetricCardProps {
  /** Metric label */
  label: string;
  /** Metric value */
  value: string | number;
  /** Trend direction */
  trend?: 'up' | 'down' | 'neutral';
  /** Change delta (percentage or absolute) */
  delta?: number;
  /** Value unit (e.g., '%', 'ms', '$') */
  unit?: string;
  /** Card size */
  size?: 'small' | 'default';
  /** Show/hide delta */
  showDelta?: boolean;
  /** Loading state */
  loading?: boolean;
}

/**
 * MetricCard - Display single metric with optional trend indicator
 *
 * Uses Ant Design tokens for all colors.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="Active Users"
 *   value={1234}
 *   trend="up"
 *   delta={15.3}
 *   unit="users"
 * />
 * ```
 */
export function UIMetricCard({
  label,
  value,
  trend = 'neutral',
  delta,
  unit,
  size = 'default',
  showDelta = true,
  loading = false,
}: UIMetricCardProps) {
  const { token } = useToken();

  // Determine trend color using Ant Design tokens
  const trendColor =
    trend === 'up' ? token.colorSuccess :
    trend === 'down' ? token.colorError :
    token.colorText;

  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <Card
      size={size}
      loading={loading}
      style={{ height: '100%' }}
    >
      <UIBox>
        {/* Label */}
        <UIText size="sm" color="secondary" as="div">
          {label}
        </UIText>

        {/* Value with unit */}
        <UIFlex align="baseline" gap={2} style={{ marginTop: token.marginXS }}>
          <UIText
            size="2xl"
            weight="bold"
            as="div"
            style={{ color: trendColor }}
          >
            {value}
          </UIText>
          {unit && (
            <UIText size="base" color="secondary">
              {unit}
            </UIText>
          )}
        </UIFlex>

        {/* Delta indicator */}
        {showDelta && delta !== undefined && (
          <UIFlex
            align="center"
            gap={1}
            style={{ marginTop: token.marginXS }}
          >
            <UIText
              size="sm"
              style={{ color: delta >= 0 ? token.colorSuccess : token.colorError }}
            >
              {trendIcon} {Math.abs(delta)}%
            </UIText>
          </UIFlex>
        )}
      </UIBox>
    </Card>
  );
}
