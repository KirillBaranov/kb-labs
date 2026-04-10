import { useMemo } from 'react';

/**
 * Chart color palette configuration
 *
 * Provides a consistent color palette for charts based on Ant Design tokens.
 * Colors are optimized for data visualization with good contrast and accessibility.
 */
export interface ChartColorPalette {
  /** Primary colors for main data series (10 colors) */
  colors: string[];
  /** Extended palette for complex charts (20 colors) */
  extendedColors: string[];
  /** Get color by index with automatic wrapping */
  getColor: (index: number) => string;
  /** Map data series to colors by field value */
  mapColors: (data: any[], colorField: string) => Record<string, string>;
}

/**
 * Hook to get chart color palette based on current theme
 *
 * Returns a palette of 10 primary colors and 20 extended colors,
 * plus helper functions for color mapping.
 *
 * @example
 * ```tsx
 * const palette = useChartColors();
 *
 * // Get color by index
 * const color = palette.getColor(0); // First color
 *
 * // Map data to colors
 * const colorMap = palette.mapColors(data, 'category');
 * // { 'Category A': '#1890ff', 'Category B': '#52c41a', ... }
 * ```
 */
export function useChartColors(): ChartColorPalette {
  return useMemo(() => {
    // Primary palette (10 colors) - for most charts
    // Using hardcoded Ant Design default colors to ensure consistency
    // (token colors may not be available in all contexts)
    const colors = [
      '#1677ff',      // Blue (colorInfo default)
      '#52c41a',      // Green (colorSuccess default)
      '#faad14',      // Orange (colorWarning default)
      '#ff4d4f',      // Red (colorError default)
      '#1890ff',      // Primary blue
      '#722ed1',      // Purple
      '#eb2f96',      // Magenta
      '#13c2c2',      // Cyan
      '#fa8c16',      // Volcano
      '#2f54eb',      // Geek blue
    ];

    console.log('[useChartColors] Created palette:', { colors });

    // Extended palette (20 colors) - for complex charts
    // Using hardcoded colors for consistency (not theme tokens)
    const extendedColors = [
      ...colors,
      '#e6f4ff',            // Light blue (colorInfoBg equivalent)
      '#f6ffed',            // Light green (colorSuccessBg equivalent)
      '#fffbe6',            // Light yellow (colorWarningBg equivalent)
      '#fff2f0',            // Light red (colorErrorBg equivalent)
      '#e6f4ff',            // Light blue (colorPrimaryBg equivalent)
      '#f759ab',            // Light magenta
      '#9254de',            // Light purple
      '#40a9ff',            // Light blue
      '#73d13d',            // Light green
      '#ffc53d',            // Light yellow
    ];

    const getColor = (index: number): string => {
      return colors[index % colors.length] || '#1890ff';
    };

    const mapColors = (data: any[], colorField: string): Record<string, string> => {
      const uniqueValues = Array.from(
        new Set(data.map(item => String(item[colorField] ?? '')))
      );
      const colorMap: Record<string, string> = {};

      uniqueValues.forEach((value, index) => {
        colorMap[value] = getColor(index);
      });

      return colorMap;
    };

    return {
      colors,
      extendedColors,
      getColor,
      mapColors,
    };
  }, []); // Empty deps - colors are hardcoded and don't need to update
}

/**
 * Create style.fill function for @ant-design/charts
 *
 * @param colorMap - Map of field values to colors
 * @param colorField - Name of the field to use for color mapping
 *
 * @example
 * ```tsx
 * const palette = useChartColors();
 * const colorMap = palette.mapColors(data, 'type');
 *
 * const config = {
 *   colorField: 'type',
 *   style: {
 *     fill: createFillFunction(colorMap, 'type'),
 *   },
 * };
 * ```
 */
export function createFillFunction(
  colorMap: Record<string, string>,
  colorField: string
): (datum: any) => string {
  return (datum: any) => {
    const value = String(datum[colorField] ?? '');
    const firstKey = Object.keys(colorMap)[0];
    return colorMap[value] || (firstKey ? colorMap[firstKey] : '#1890ff') || '#1890ff';
  };
}
