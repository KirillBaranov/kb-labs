import { useMemo } from 'react';
import { UIText, UICard, UIAreaChart, useChartColors } from '@kb-labs/studio-ui-kit';
import type { DailyStats } from '@kb-labs/studio-data-client';
import dayjs from 'dayjs';

/**
 * Configuration for chart metrics
 */
export interface ChartMetricConfig {
  /**
   * Metric key from DailyStats.metrics
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

export interface AnalyticsDailyStatsChartProps {
  /**
   * Daily statistics data
   */
  data: DailyStats[] | undefined;

  /**
   * Loading state
   */
  loading?: boolean;

  /**
   * Chart title
   */
  title: string;

  /**
   * Metrics to display on the chart
   * Each metric will be shown as a separate line
   */
  metrics: ChartMetricConfig[];

  /**
   * Optional card style
   */
  style?: React.CSSProperties;

  /**
   * Chart height in pixels
   */
  height?: number;
}

/**
 * Reusable daily statistics chart component
 *
 * Displays time-series chart with multiple metrics for analytics pages.
 * Used across LLM, Embeddings, VectorStore, Cache, and Storage analytics.
 *
 * @example
 * ```tsx
 * <AnalyticsDailyStatsChart
 *   data={dailyStats}
 *   loading={isLoading}
 *   title="Daily LLM Usage Trend"
 *   metrics={[
 *     { key: 'count', label: 'Requests' },
 *     { key: 'totalTokens', label: 'Tokens (K)', transform: (v) => v / 1000 },
 *     { key: 'totalCost', label: 'Cost ($)', format: (v) => `$${v.toFixed(2)}` },
 *   ]}
 * />
 * ```
 */
export function AnalyticsDailyStatsChart({
  data,
  loading = false,
  title,
  metrics,
  style,
  height = 350,
}: AnalyticsDailyStatsChartProps) {
  const palette = useChartColors();

  // Memoize chart colors to ensure stability across renders
  const chartColors = useMemo(() => {
    console.log('[useMemo] Input:', {
      paletteColors: palette.colors,
      isArray: Array.isArray(palette.colors),
      length: palette.colors?.length,
      first3: palette.colors.slice(0, 3),
      metricsLength: metrics.length,
    });

    const result = palette.colors.slice(0, metrics.length);

    console.log('[useMemo] Output:', {
      result,
      isArray: Array.isArray(result),
      length: result.length,
    });

    return result;
  }, [palette.colors, metrics.length]);

  console.log('[AnalyticsDailyStatsChart] Colors:', {
    metricsCount: metrics.length,
    chartColors,
    paletteColors: palette.colors,
  });

  // Transform data for chart
  const chartData =
    data?.flatMap((stat) => {
      const rows: Array<{ date: string; category: string; value: number }> = [];

      for (const metric of metrics) {
        let value: number;

        if (metric.key === 'count') {
          // Special case: count is top-level field
          value = stat.count;
        } else {
          // Extract from metrics object
          value = stat.metrics?.[metric.key] ?? 0;
        }

        // Apply transformation if provided
        if (metric.transform) {
          value = metric.transform(value);
        }

        rows.push({
          date: dayjs(stat.date).format('YYYY-MM-DD'), // Ensure consistent date format
          category: metric.label,
          value,
        });
      }

      return rows;
    }) ?? [];

  console.log('[AnalyticsDailyStatsChart] Chart data:', {
    dataLength: chartData.length,
    uniqueCategories: [...new Set(chartData.map(d => d.category))],
    sampleData: chartData.slice(0, 3),
  });

   
  const cardStyle = { marginTop: 16, ...style } as any;
  return (
    <UICard title={title} style={cardStyle}>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UIText color="secondary">Loading chart data...</UIText>
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <div>
          {/* Custom Legend */}
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

          <UIAreaChart
            data={chartData}
            xField="date"
            yField="value"
            colorField="category"
            colors={chartColors}
            height={height}
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
                    if (num >= 1000000) {return `${(num / 1000000).toFixed(1)}M`;}
                    if (num >= 1000) {return `${(num / 1000).toFixed(1)}K`;}
                    return num.toLocaleString();
                  },
                },
              },
            }}
            style={{
              fillOpacity: 0.3,
            }}
            legend={false}
            tooltip={{
              title: (d: any) => d.date,
              items: [
                (d: any) => {
                  const metric = metrics.find((m) => m.label === d.category);
                  const metricIndex = metrics.findIndex((m) => m.label === d.category);
                  let formattedValue = d.value?.toLocaleString() || '0';

                  if (metric?.format && d.value != null) {
                    formattedValue = metric.format(d.value);
                  }

                  const tooltipColor = chartColors[metricIndex >= 0 ? metricIndex : 0];

                  console.log('[Tooltip] Color:', {
                    category: d.category,
                    metricIndex,
                    tooltipColor,
                    chartColors,
                  });

                  return {
                    name: d.category,
                    value: formattedValue,
                    color: tooltipColor,
                  };
                },
              ],
            }}
          />
        </div>
      )}

      {!loading && chartData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UIText color="secondary">No data available for the selected date range</UIText>
        </div>
      )}
    </UICard>
  );
}
