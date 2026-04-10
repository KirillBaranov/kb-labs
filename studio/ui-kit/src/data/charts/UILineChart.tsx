import * as React from 'react';
import { Line } from '@ant-design/charts';
import { theme } from 'antd';
import type { LineConfig } from '@ant-design/charts';
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

export interface UILineChartProps extends Omit<LineConfig, 'theme'> {
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
 * UILineChart - Line chart with automatic theming and color mapping
 *
 * Wrapper around @ant-design/charts Line component that uses theme tokens
 * for automatic light/dark mode support and automatic color mapping.
 *
 * @example
 * ```tsx
 * // Automatic color mapping (recommended)
 * <UILineChart
 *   data={data}
 *   xField="date"
 *   yField="value"
 *   colorField="category"
 * />
 *
 * // Custom colors
 * <UILineChart
 *   data={data}
 *   xField="date"
 *   yField="value"
 *   colorField="category"
 *   colors={['#ff0000', '#00ff00']}
 * />
 *
 * // Manual color control via scale
 * <UILineChart
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
export function UILineChart({ colors, disableAutoColors, ...props }: UILineChartProps) {
  const chartTheme = useChartTheme();
  const palette = useChartColors();

  // Auto-map colors if colorField or seriesField is provided and auto-colors are not disabled
  const enhancedProps = React.useMemo(() => {
    // For Line charts, colors are mapped via either colorField or seriesField
    const hasColorField = props.colorField || (props as any).seriesField;

    console.log('[UILineChart] Debug info:', {
      hasColorField,
      colorField: props.colorField,
      seriesField: (props as any).seriesField,
      disableAutoColors,
      hasData: !!props.data,
      dataLength: props.data?.length,
      customColors: colors,
      paletteColors: palette.colors,
    });

    if (disableAutoColors || !hasColorField || !props.data) {
      console.log('[UILineChart] Skipping auto-colors:', {
        disableAutoColors,
        hasColorField,
        hasData: !!props.data,
      });
      return props;
    }

    // Use custom colors if provided, otherwise use palette
    const colorSource = colors || palette.colors;

    console.log('[UILineChart] Applying colors:', {
      source: colors ? 'custom' : 'palette',
      colors: colorSource,
    });

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

  return <Line {...enhancedProps} theme={chartTheme} />;
}
