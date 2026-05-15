import * as React from 'react';
import { Card, theme, Tooltip } from 'antd';
import { UIText } from '../primitives/UIText';
import { UIFlex } from '../primitives/UIFlex';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export interface UIMetricCardProps {
  /** Metric label */
  label: string;
  /** Metric value */
  value: string | number;
  /** Icon shown in colored badge */
  icon?: React.ReactNode;
  /** Color theme for the icon badge */
  status?: 'default' | 'info' | 'success' | 'warning' | 'error';
  /** Trend direction */
  trend?: 'up' | 'down' | 'neutral';
  /** Change delta (percentage) */
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

export function UIMetricCard({
  label,
  value,
  icon,
  status = 'default',
  trend = 'neutral',
  delta,
  unit,
  size = 'default',
  showDelta = true,
  loading = false,
}: UIMetricCardProps) {
  const { token } = useToken();

  const iconBgMap: Record<string, string> = {
    default: token.colorFillSecondary,
    info: token.colorInfoBg,
    success: token.colorSuccessBg,
    warning: token.colorWarningBg,
    error: token.colorErrorBg,
  };

  const iconColorMap: Record<string, string> = {
    default: token.colorTextSecondary,
    info: token.colorInfo,
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
  };

  const trendColor =
    trend === 'up' ? token.colorSuccess :
    trend === 'down' ? token.colorError :
    token.colorTextSecondary;

  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <Card size={size} loading={loading} style={{ height: '100%' }}>
      <UIBox>
        {icon && (
          <div style={{
            width: 36,
            height: 36,
            borderRadius: token.borderRadiusSM,
            backgroundColor: iconBgMap[status],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColorMap[status],
            fontSize: 16,
            marginBottom: token.marginSM,
          }}>
            {icon}
          </div>
        )}

        <UIText size="sm" color="secondary" as="div">
          {label}
        </UIText>

        <Tooltip title={String(value)} mouseEnterDelay={0.6}>
          <UIFlex align="baseline" gap={2} style={{ marginTop: 4, overflow: 'hidden' }}>
            <UIText
              size="2xl"
              weight="bold"
              as="div"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
            >
              {value}
            </UIText>
            {unit && (
              <UIText size="base" color="secondary" style={{ flexShrink: 0 }}>
                {unit}
              </UIText>
            )}
          </UIFlex>
        </Tooltip>

        {showDelta && delta !== undefined && (
          <UIFlex align="center" gap={1} style={{ marginTop: token.marginXS }}>
            <UIText size="sm" style={{ color: delta >= 0 ? token.colorSuccess : token.colorError }}>
              {trendIcon} {Math.abs(delta)}%
            </UIText>
          </UIFlex>
        )}
      </UIBox>
    </Card>
  );
}
