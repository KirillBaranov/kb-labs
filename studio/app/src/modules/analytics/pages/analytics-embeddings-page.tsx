import { useState } from 'react';
import { UIRow, UICol, UIStatistic, UIAlert, UIProgress, UIMetricCard } from '@kb-labs/studio-ui-kit';
import {
  ApiOutlined,
  DollarOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  TeamOutlined,
  GroupOutlined,
} from '@ant-design/icons';
import { UIText, UIStatisticsChart, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { useAdaptersEmbeddingsUsage, useAdaptersEmbeddingsDailyStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { AnalyticsDateRangePicker, type DateRangeValue } from '../components/analytics-date-range-picker';
import { formatCost } from '../utils/formatters';
import dayjs from 'dayjs';


/**
 * Analytics Embeddings Usage Page
 *
 * Displays embeddings usage statistics:
 * - Total requests and text volume
 * - Cost tracking
 * - Batch efficiency metrics
 * - Performance metrics
 */
export function AnalyticsEmbeddingsPage() {
  const sources = useDataSources();

  // Date range state (default: last 30 days)
  const [dateRange, setDateRange] = useState<DateRangeValue>([
    dayjs().subtract(30, 'days'),
    dayjs(),
  ]);

  const {
    data: stats,
    isLoading,
    error,
    isError,
  } = useAdaptersEmbeddingsUsage(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useAdaptersEmbeddingsDailyStats(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  // Check if analytics is not implemented
  const analyticsNotImplemented =
    isError &&
    error instanceof Error &&
    (error.message.includes('not support') || error.message.includes('not implement'));

  if (analyticsNotImplemented) {
    return (
      <UIPage>
        <UIPageHeader
          title="Embeddings Usage"
          description="Track embeddings API usage, costs, and batch efficiency"
        />
        <UIAlert
          message="Analytics Not Available"
          description="Analytics adapter does not support reading events. Configure an analytics adapter in kb.config.json that implements getEvents()."
          variant="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  if (isError) {
    return (
      <UIPage>
        <UIPageHeader title="Embeddings Usage" description="Embeddings usage analytics" />
        <UIAlert
          message="Failed to Load Embeddings Usage"
          description={error?.message || 'Unknown error occurred'}
          variant="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  const batchPercentage = stats ? ((stats.batchRequests / stats.totalRequests) * 100).toFixed(1) : 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Embeddings Usage Analytics"
        description="Track embeddings API usage, costs, and batch processing efficiency"
        actions={
          <AnalyticsDateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        }
      />

      <div style={{ marginTop: 24 }}>
        {/* Overview Stats */}
        <UIRow gutter={[16, 16]}>
          {[
            { label: 'Total Requests', value: stats?.totalRequests ?? 0, icon: <ApiOutlined />, status: 'info' as const },
            { label: 'Text Processed', value: stats?.totalTextLength ?? 0, icon: <FileTextOutlined />, status: 'success' as const, unit: 'chars' },
            { label: 'Total Cost', value: stats ? formatCost(stats.totalCost) : '0', icon: <DollarOutlined />, status: 'error' as const },
            { label: 'Errors', value: stats?.errors ?? 0, icon: <WarningOutlined />, status: (stats && stats.errors > 0 ? 'warning' : 'success') as 'warning' | 'success' },
          ].map((metric) => (
            <UICol key={metric.label} xs={24} sm={12} lg={6}>
              <UIMetricCard {...metric} loading={isLoading} />
            </UICol>
          ))}
        </UIRow>

        {/* Batch Efficiency */}
        <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
          <UICol xs={24} lg={12}>
            <UICard title="Batch Processing" style={{ height: '100%' }}>
              <UIRow gutter={[16, 16]}>
                <UICol span={12}>
                  <UIStatistic
                    title="Single Requests"
                    value={stats?.singleRequests ?? 0}
                    prefix={<TeamOutlined />}
                    loading={isLoading}
                  />
                </UICol>
                <UICol span={12}>
                  <UIStatistic
                    title="Batch Requests"
                    value={stats?.batchRequests ?? 0}
                    prefix={<GroupOutlined />}
                    loading={isLoading}
                  />
                </UICol>
              </UIRow>
              <div style={{ marginTop: 16 }}>
                <UIText color="secondary">Batch Request Ratio</UIText>
                <UIProgress
                  percent={Number(batchPercentage)}
                  status={Number(batchPercentage) > 50 ? 'success' : 'normal'}
                  format={(percent) => `${percent}%`}
                />
              </div>
            </UICard>
          </UICol>
          <UICol xs={24} lg={12}>
            <UICard title="Performance Metrics" style={{ height: '100%' }}>
              <UIRow gutter={[16, 16]}>
                <UICol span={12}>
                  <UIStatistic
                    title="Avg Duration"
                    value={stats?.avgDurationMs ?? 0}
                    prefix={<ClockCircleOutlined />}
                    suffix="ms"
                    precision={0}
                    loading={isLoading}
                  />
                </UICol>
                <UICol span={12}>
                  <UIStatistic
                    title="Avg Batch Size"
                    value={stats?.avgBatchSize ?? 0}
                    precision={1}
                    loading={isLoading}
                    valueStyle={{ color: 'var(--link)' }}
                  />
                </UICol>
              </UIRow>
            </UICard>
          </UICol>
        </UIRow>

        {/* Cost Analysis */}
        {stats && stats.totalRequests > 0 && (
          <UICard title="Cost Analysis" style={{ marginTop: 16 }}>
            <UIRow gutter={[16, 16]}>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Cost per Request"
                  value={(stats.totalCost / stats.totalRequests).toFixed(6)}
                  prefix="$"
                  loading={isLoading}
                />
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Cost per 1K Characters"
                  value={((stats.totalCost / stats.totalTextLength) * 1000).toFixed(6)}
                  prefix="$"
                  loading={isLoading}
                />
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Avg Text Length"
                  value={Math.round(stats.totalTextLength / stats.totalRequests)}
                  suffix="chars"
                  loading={isLoading}
                />
              </UICol>
            </UIRow>
          </UICard>
        )}

        {/* Daily Usage Chart */}
        <UIStatisticsChart
          data={dailyStats}
          loading={dailyStatsLoading}
          title="Daily Embeddings Trend"
          metrics={[
            { key: 'count', label: 'Requests' },
            {
              key: 'totalTokens',
              label: 'Tokens (K)',
              transform: (v) => Math.floor(v / 1000),
            },
            {
              key: 'totalCost',
              label: 'Cost ($)',
              format: formatCost,
            },
          ]}
        />
      </div>
    </UIPage>
  );
}
