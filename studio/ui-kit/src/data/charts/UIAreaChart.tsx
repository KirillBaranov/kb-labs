import * as React from 'react';
import { Area } from '@ant-design/charts';
import { theme } from 'antd';
import type { AreaConfig } from '@ant-design/charts';
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

export interface UIAreaChartProps extends Omit<AreaConfig, 'theme'> {
  /**
   * Custom colors to override theme colors
   * If not provided, automatic color palette will be used
   */
  colors?: string[];
  /**
   * Disable automatic color mapping
   * Set to true if you want to handle colors manually via style.fill
   */
  disableAutoColors?: boolean;
}

/**
 * UIAreaChart - Area chart with automatic theming and color mapping
 *
 * Wrapper around @ant-design/charts Area component that uses theme tokens
 * for automatic light/dark mode support and automatic color mapping.
 *
 * @example
 * ```tsx
 * // Automatic color mapping (recommended)
 * <UIAreaChart
 *   data={data}
 *   xField="date"
 *   yField="value"
 *   colorField="category"
 * />
 *
 * // Custom colors
 * <UIAreaChart
 *   data={data}
 *   xField="date"
 *   yField="value"
 *   colorField="category"
 *   colors={['#ff0000', '#00ff00']}
 * />
 *
 * // Manual color control via scale
 * <UIAreaChart
 *   data={data}
 *   xField="date"
 *   yField="value"
 *   colorField="category"
 *   disableAutoColors
 *   scale={{
 *     color: {
 *       range: ['#ff0000', '#00ff00']
 *     }
 *   }}
 * />
 * ```
 */
export function UIAreaChart({ colors, disableAutoColors, ...props }: UIAreaChartProps) {
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

  return <Area {...enhancedProps} theme={chartTheme} />;
}
