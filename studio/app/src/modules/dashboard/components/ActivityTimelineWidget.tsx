import React, { useState } from 'react';
import { UICard, UISegmented } from '@kb-labs/studio-ui-kit';
import { UIAreaChart, useChartColors } from '@kb-labs/studio-ui-kit';
import { useDataSources } from '../../../providers/data-sources-provider';
import { useMetricsHistory } from '@kb-labs/studio-data-client';

type TimeRange = '1m' | '5m' | '10m' | '30m';

const TIME_RANGE_CONFIG = {
  '1m': { label: '1 min' },
  '5m': { label: '5 min' },
  '10m': { label: '10 min' },
  '30m': { label: '30 min' },
};

export function ActivityTimelineWidget() {
  const sources = useDataSources();
  const palette = useChartColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('10m');

  // Get colors from palette for legend
  const colorMap = palette.mapColors([{ type: 'Requests' }, { type: 'Errors' }], 'type');
  const requestsColor = colorMap['Requests'];
  const errorsColor = colorMap['Errors'];

  // Fetch requests and errors history
  const requestsQuery = useMetricsHistory(sources.observability, {
    metric: 'requests',
    range: timeRange,
    interval: '5s',
  });

  const errorsQuery = useMetricsHistory(sources.observability, {
    metric: 'errors',
    range: timeRange,
    interval: '5s',
  });

  // Transform data for chart
  const chartData = React.useMemo(() => {
    if (!requestsQuery.data || !errorsQuery.data) {return [];}

    // Merge requests and errors by timestamp
    const dataMap = new Map<number, { time: string; Requests: number; Errors: number }>();

    for (const point of requestsQuery.data) {
      const time = new Date(point.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      dataMap.set(point.timestamp, { time, Requests: point.value, Errors: 0 });
    }

    for (const point of errorsQuery.data) {
      const existing = dataMap.get(point.timestamp);
      if (existing) {
        existing.Errors = point.value;
      }
    }

    return Array.from(dataMap.values());
  }, [requestsQuery.data, errorsQuery.data]);

  // Current values for legend
  const currentRequests = requestsQuery.data?.[requestsQuery.data.length - 1]?.value ?? 0;
  const currentErrors = errorsQuery.data?.[errorsQuery.data.length - 1]?.value ?? 0;

  const config = {
    xField: 'time',
    yField: 'value',
    colorField: 'type',
    height: 250,
    smooth: true,
    style: {
      fillOpacity: 0.3,
    },
    axis: {
      x: {
        label: {
          autoRotate: true,
        },
      },
      y: {
        label: {
          formatter: (v: string) => {
            const num = Number(v);
            if (num >= 1000) {return `${(num / 1000).toFixed(1)}K`;}
            return num.toLocaleString();
          },
        },
      },
    },
    legend: false,
    tooltip: {
      title: (d: any) => d.time,
      items: [
        (d: any) => ({
          name: d.type,
          value: d.value?.toLocaleString() ?? 0,
          color: colorMap[d.type],
        }),
      ],
    },
  };

  // Transform to multi-series format
  const multiSeriesData = chartData.flatMap(point => [
    { time: point.time, type: 'Requests', value: point.Requests },
    { time: point.time, type: 'Errors', value: point.Errors },
  ]);

  const isLoading = requestsQuery.isLoading || errorsQuery.isLoading;
  const hasError = requestsQuery.isError || errorsQuery.isError;

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Requests & Errors</span>
          <UISegmented
            options={Object.entries(TIME_RANGE_CONFIG).map(([key, cfg]) => ({
              label: cfg.label,
              value: key,
            }))}
            value={timeRange}
            onChange={(value) => setTimeRange(value as TimeRange)}
            size="small"
          />
        </div>
      }
      styles={{ body: { padding: '16px' } }}
    >
      {isLoading ? (
        <div style={{
          height: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}>
          Loading metrics...
        </div>
      ) : hasError ? (
        <div style={{
          height: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--error)',
        }}>
          Failed to load metrics
        </div>
      ) : chartData.length > 0 ? (
        <div>
          {/* Custom Legend */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: requestsColor,
              }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Requests ({currentRequests.toLocaleString()})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: errorsColor,
              }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Errors ({currentErrors.toLocaleString()})
              </span>
            </div>
          </div>
          <UIAreaChart {...config} data={multiSeriesData} />
        </div>
      ) : (
        <div style={{
          height: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}>
          No data available
        </div>
      )}
    </UICard>
  );
}
