import * as React from 'react';
import { Card } from 'antd';
import dayjs from 'dayjs';
import { UILineChart } from './UILineChart';
import { UIText } from '../../primitives';
import { useChartColors } from './useChartColors';
import type { LineConfig } from '@ant-design/charts';

/**
 * Configuration for chart metrics
 */
export interface ChartMetricConfig {
  /**
   * Metric key from data object
   * - For top-level fields: use the field name directly (e.g., 'count')
   * - For nested fields: data will be extracted from record.metrics[key] if metrics object exists
   */
  key: string;

  /**
   * Display label for the metric
   */
  label: string;

  /**
   * Optional transformer function to convert raw value to display value
   * Example: (v) => v / 1000 to convert tokens to K tokens
   */
  transform?: (value: number) => number;

  /**
   * Optional formatter for tooltip
   */
  format?: (value: number) => string;
}

export interface UIStatisticsChartProps {
  /**
   * Chart data - can be either:
   * 1. Pre-transformed: Array<{ [xField]: string, [yField]: number, [colorField]: string }>
   * 2. Raw DailyStats: Array<{ date: string, count: number, metrics: { [key]: number } }>
   */
  data: any[] | undefined;

  /**
   * Loading state
   */
  loading?: boolean;

  /**
   * Chart title
   */
  title?: string;

  /**
   * Metrics to display on the chart
   * Each metric will be shown as a separate line
   *
   * Only used when data transformation is needed (raw DailyStats format)
   */
  metrics?: ChartMetricConfig[];

  /**
   * X-axis field name (default: 'date')
   */
  xField?: string;

  /**
   * Y-axis field name (default: 'value')
   */
  yField?: string;

  /**
   * Color field name (default: 'category')
   */
  colorField?: string;

  /**
   * Optional card style
   */
  style?: React.CSSProperties;

  /**
   * Chart height in pixels
   */
  height?: number;

  /**
   * Show legend (default: true)
   */
  showLegend?: boolean;

  /**
   * Additional LineChart props
   */
  chartProps?: Partial<LineConfig>;
}

/**
 * UIStatisticsChart - Reusable statistics chart with legend and loading states
 *
 * Specialized chart component for displaying time-series statistics with automatic theming.
 * Includes built-in legend, loading states, and empty states.
 *
 * Supports two data formats:
 * 1. Pre-transformed chart data (simple array of objects with xField, yField, colorField)
 * 2. Raw DailyStats format (automatically transforms using metrics config)
 *
 * @example Pre-transformed data
 * ```tsx
 * <UIStatisticsChart
 *   data={[
 *     { date: '2024-01-01', value: 100, category: 'Requests' },
 *     { date: '2024-01-01', value: 5000, category: 'Tokens' },
 *   ]}
 *   loading={isLoading}
 *   title="Daily Usage"
 * />
 * ```
 *
 * @example Raw DailyStats with transformation
 * ```tsx
 * <UIStatisticsChart
 *   data={dailyStats}
 *   loading={isLoading}
 *   title="Daily Usage Trend"
 *   metrics={[
 *     { key: 'count', label: 'Requests' },
 *     { key: 'totalTokens', label: 'Tokens (K)', transform: (v) => v / 1000 },
 *     { key: 'totalCost', label: 'Cost ($)', format: (v) => `$${v.toFixed(2)}` },
 *   ]}
 * />
 * ```
 */
export function UIStatisticsChart({
  data,
  loading = false,
  title,
  metrics = [],
  xField = 'date',
  yField = 'value',
  colorField = 'category',
  style,
  height = 350,
  showLegend = true,
  chartProps,
}: UIStatisticsChartProps) {
  const palette = useChartColors();

  // Chart colors from centralized palette
  const chartColors = React.useMemo(
    () => palette.colors.slice(0, Math.max(metrics.length, 3)),
    [palette.colors, metrics.length]
  );

  // Transform data if metrics are provided (raw DailyStats format)
  const chartData = React.useMemo(() => {
    if (!data) {
      return [];
    }

    // If no metrics provided, assume data is already in chart format
    if (metrics.length === 0) {
      return data;
    }

    // Transform raw DailyStats to chart format
    return data.flatMap((stat) => {
      const rows: Array<{ [key: string]: any }> = [];

      for (const metric of metrics) {
        let value: number;

        // Extract value: check top-level first, then metrics object
        if (metric.key in stat && typeof stat[metric.key] === 'number') {
          // Top-level field (e.g., 'count')
          value = stat[metric.key];
        } else if (stat.metrics && metric.key in stat.metrics) {
          // Nested in metrics object
          value = stat.metrics[metric.key];
        } else {
          // Not found, default to 0
          value = 0;
        }

        // Apply transformation if provided
        if (metric.transform) {
          value = metric.transform(value);
        }

        rows.push({
          [xField]: stat.date ? dayjs(stat.date).format('YYYY-MM-DD') : stat[xField],
          [colorField]: metric.label,
          [yField]: value,
        });
      }

      return rows;
    });
  }, [data, metrics, xField, yField, colorField]);

  // Render legend
  const renderLegend = () => {
    if (!showLegend || metrics.length === 0) {
      return null;
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 16 }}>
        {metrics.map((metric, index) => (
          <div key={metric.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: chartColors[index % chartColors.length],
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{metric.label}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render function for content
  const renderContent = () => (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UIText color="secondary">Loading chart data...</UIText>
        </div>
      )}

      {!loading && (!chartData || chartData.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UIText color="secondary">No data available for the selected date range</UIText>
        </div>
      )}

      {!loading && chartData && chartData.length > 0 && (
      <div>
        {renderLegend()}


        <UILineChart
          data={chartData}
          xField={xField}
          yField={yField}
          colorField={colorField}
          height={height}
          colors={chartColors}
          scale={{
            color: {
              range: chartColors,
            },
          }}
          axis={{
            x: {
              label: {
                autoRotate: false,
              },
            },
            y: {
              label: {
                formatter: (v: string) => {
                  const num = Number(v);
                  if (num >= 1000000) {
                    return `${(num / 1000000).toFixed(1)}M`;
                  }
                  if (num >= 1000) {
                    return `${(num / 1000).toFixed(1)}K`;
                  }
                  return num.toLocaleString();
                },
              },
            },
          }}
          style={{
            shape: 'smooth',
            lineWidth: 2,
          }}
          legend={false}
          tooltip={{
            title: (d: any) => d[xField],
            items: [
              (d: any) => {
                const metric = metrics.find((m) => m.label === d[colorField]);
                const metricIndex = metrics.findIndex((m) => m.label === d[colorField]);
                let formattedValue = d[yField]?.toLocaleString() || '0';

                if (metric?.format && d[yField] != null) {
                  formattedValue = metric.format(d[yField]);
                }

                return {
                  name: d[colorField],
                  value: formattedValue,
                  color: chartColors[metricIndex >= 0 ? metricIndex : 0],
                };
              },
            ],
          }}
          {...chartProps}
        />
      </div>
      )}
    </>
  );

  // Render with or without Card wrapper depending on title
  if (title) {
    return (
      <Card title={title} style={{ marginTop: 16, ...style }}>
        {renderContent()}
      </Card>
    );
  }

  // No title - render content directly
  return <div style={style}>{renderContent()}</div>;
}
