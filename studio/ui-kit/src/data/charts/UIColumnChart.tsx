import * as React from 'react';
import { Column } from '@ant-design/charts';
import { theme } from 'antd';
import type { ColumnConfig } from '@ant-design/charts';

const { useToken } = theme;

/**
 * Get chart theme from Ant Design tokens
 */
function useChartTheme() {
  const { token } = useToken();

  return React.useMemo(
    () => ({
      defaultColor: token.colorPrimary,
      colors10: [
        token.colorInfo,
        token.colorSuccess,
        token.colorWarning,
        token.colorError,
        token.colorPrimary,
        token.colorInfoBg,
        token.colorSuccessBg,
        token.colorWarningBg,
        token.colorErrorBg,
        token.colorPrimaryBg,
      ],
      colors20: [
        token.colorInfo,
        token.colorSuccess,
        token.colorWarning,
        token.colorError,
        token.colorPrimary,
        token.colorInfoBg,
        token.colorSuccessBg,
        token.colorWarningBg,
        token.colorErrorBg,
        token.colorPrimaryBg,
        token.colorInfoBorder,
        token.colorSuccessBorder,
        token.colorWarningBorder,
        token.colorErrorBorder,
        token.colorPrimaryBorder,
        token.colorInfoText,
        token.colorSuccessText,
        token.colorWarningText,
        token.colorErrorText,
        token.colorPrimaryText,
      ],
      styleSheet: {
        backgroundColor: token.colorBgContainer,
        fontFamily: token.fontFamily,
        fontSize: token.fontSize,
        color: token.colorText,
      },
    }),
    [token],
  );
}

export interface UIColumnChartProps extends Omit<ColumnConfig, 'theme'> {
  /**
   * Custom colors to override theme colors
   */
  colors?: string[];
}

/**
 * UIColumnChart - Column chart with automatic theming
 *
 * Wrapper around @ant-design/charts Column component that uses theme tokens
 * for automatic light/dark mode support.
 *
 * @example
 * ```tsx
 * <UIColumnChart
 *   data={data}
 *   xField="category"
 *   yField="value"
 *   colorField="type"
 * />
 * ```
 */
export function UIColumnChart({ colors, ...props }: UIColumnChartProps) {
  const chartTheme = useChartTheme();

  // Merge theme with custom colors if provided
  const mergedTheme = colors
    ? {
        ...chartTheme,
        colors10: colors,
        colors20: colors,
      }
    : chartTheme;

  return <Column {...props} theme={mergedTheme} />;
}
