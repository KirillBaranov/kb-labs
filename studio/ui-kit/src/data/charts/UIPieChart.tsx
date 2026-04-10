import * as React from 'react';
import { Pie } from '@ant-design/charts';
import { theme } from 'antd';
import type { PieConfig } from '@ant-design/charts';
import { useChartColors } from './useChartColors';

const { useToken } = theme;

/**
 * Get chart theme from Ant Design tokens
 */
function useChartTheme() {
  const { token } = useToken();

  return React.useMemo(
    () => ({
      defaultColor: token.colorPrimary,
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

export interface UIPieChartProps extends Omit<PieConfig, 'theme'> {
  /**
   * Custom colors to override theme colors
   * If not provided, automatic color palette will be used
   */
  colors?: string[];
  /**
   * Disable automatic color mapping
   * Set to true if you want to handle colors manually
   */
  disableAutoColors?: boolean;
}

/**
 * UIPieChart - Pie/Donut chart with automatic theming and color mapping
 *
 * Wrapper around @ant-design/charts Pie component that uses theme tokens
 * for automatic light/dark mode support and automatic color mapping.
 *
 * @example
 * ```tsx
 * // Automatic color mapping (recommended)
 * <UIPieChart
 *   data={data}
 *   angleField="value"
 *   colorField="category"
 * />
 * ```
 *
 * @example Donut chart
 * ```tsx
 * <UIPieChart
 *   data={data}
 *   angleField="value"
 *   colorField="category"
 *   innerRadius={0.6}
 * />
 * ```
 */
export function UIPieChart({ colors, disableAutoColors, ...props }: UIPieChartProps) {
  const chartTheme = useChartTheme();
  const palette = useChartColors();

  // Auto-map colors if colorField is provided and auto-colors are not disabled
  const enhancedProps = React.useMemo(() => {
    if (disableAutoColors || !props.colorField || !props.data) {
      return props;
    }

    // Use custom colors if provided, otherwise use palette
    const colorSource = colors || palette.colors;

    return {
      ...props,
      scale: {
        ...props.scale,
        color: {
          range: colorSource,
        },
      },
    };
  }, [props, colors, palette.colors, disableAutoColors]);

  return <Pie {...enhancedProps} theme={chartTheme} />;
}
