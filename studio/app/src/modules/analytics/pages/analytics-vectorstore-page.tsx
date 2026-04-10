import { useState } from 'react';
import { UIRow, UICol, UIStatistic, UIAlert, UIProgress } from '@kb-labs/studio-ui-kit';
import {
  SearchOutlined,
  PlusCircleOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  StarOutlined,
  FileSearchOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { UIText, UIStatisticsChart, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { useAdaptersVectorStoreUsage, useAdaptersVectorStoreDailyStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { AnalyticsDateRangePicker, type DateRangeValue } from '../components/analytics-date-range-picker';
import dayjs from 'dayjs';


/**
 * Analytics VectorStore Usage Page
 *
 * Displays vector database usage statistics:
 * - Search, upsert, and delete operations
 * - Search quality metrics (avg score)
 * - Performance metrics
 * - Storage growth tracking
 */
export function AnalyticsVectorStorePage() {
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
  } = useAdaptersVectorStoreUsage(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useAdaptersVectorStoreDailyStats(sources.adapters, {
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
          title="VectorStore Usage"
          description="Track vector database operations and search quality"
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
        <UIPageHeader title="VectorStore Usage" description="Vector database usage analytics" />
        <UIAlert
          message="Failed to Load VectorStore Usage"
          description={error?.message || 'Unknown error occurred'}
          variant="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  // Format helpers
  const _formatNumber = (num: number) => num.toLocaleString();
  const _formatDuration = (ms: number) => (ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`);
  const _formatScore = (score: number) => (score * 100).toFixed(1) + '%';

  const totalOperations = stats
    ? stats.searchQueries + stats.upsertOperations + stats.deleteOperations
    : 0;

  const searchPercentage = stats && totalOperations > 0
    ? ((stats.searchQueries / totalOperations) * 100).toFixed(1)
    : 0;

  const scoreStatus = stats && stats.avgSearchScore >= 0.8
    ? 'success'
    : stats && stats.avgSearchScore >= 0.6
    ? 'normal'
    : 'exception';

  return (
    <UIPage width="full">
      <UIPageHeader
        title="VectorStore Usage Analytics"
        description="Track vector database operations, search quality, and storage growth"
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
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Search Queries"
                value={stats?.searchQueries ?? 0}
                prefix={<SearchOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--info)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Upsert Operations"
                value={stats?.upsertOperations ?? 0}
                prefix={<PlusCircleOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--success)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Delete Operations"
                value={stats?.deleteOperations ?? 0}
                prefix={<DeleteOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--warning)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Total Operations"
                value={totalOperations}
                prefix={<DatabaseOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--link)' }}
              />
            </UICard>
          </UICol>
        </UIRow>

        {/* Search Quality */}
        <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
          <UICol xs={24} lg={12}>
            <UICard title="Search Quality">
              <UIStatistic
                title="Average Search Score"
                value={stats?.avgSearchScore ?? 0}
                precision={3}
                prefix={<StarOutlined />}
                loading={isLoading}
                valueStyle={{
                  color: scoreStatus === 'success' ? 'var(--success)' : scoreStatus === 'normal' ? 'var(--info)' : 'var(--warning)'
                }}
              />
              <div style={{ marginTop: 16 }}>
                <UIText color="secondary">Search Quality Rating</UIText>
                <UIProgress
                  percent={Number(((stats?.avgSearchScore ?? 0) * 100).toFixed(1))}
                  status={scoreStatus}
                  format={(percent) => `${percent}%`}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <UIStatistic
                  title="Avg Results per Query"
                  value={stats?.avgResultsCount ?? 0}
                  precision={1}
                  prefix={<FileSearchOutlined />}
                  loading={isLoading}
                />
              </div>
            </UICard>
          </UICol>
          <UICol xs={24} lg={12}>
            <UICard title="Performance Metrics">
              <UIStatistic
                title="Avg Search Duration"
                value={stats?.avgSearchDuration ?? 0}
                prefix={<ClockCircleOutlined />}
                suffix="ms"
                precision={1}
                loading={isLoading}
              />
              <div style={{ marginTop: 24 }}>
                <UIText color="secondary">Operation Distribution</UIText>
                <UIProgress
                  percent={Number(searchPercentage)}
                  format={(percent) => `${percent}% searches`}
                />
              </div>
            </UICard>
          </UICol>
        </UIRow>

        {/* Storage Growth */}
        <UICard title="Storage Statistics" style={{ marginTop: 16 }}>
          <UIRow gutter={[16, 16]}>
            <UICol xs={24} sm={8}>
              <UIStatistic
                title="Vectors Added"
                value={stats?.totalVectorsUpserted ?? 0}
                prefix={<PlusCircleOutlined />}
                valueStyle={{ color: 'var(--success)' }}
                loading={isLoading}
              />
            </UICol>
            <UICol xs={24} sm={8}>
              <UIStatistic
                title="Vectors Deleted"
                value={stats?.totalVectorsDeleted ?? 0}
                prefix={<DeleteOutlined />}
                valueStyle={{ color: 'var(--error)' }}
                loading={isLoading}
              />
            </UICol>
            <UICol xs={24} sm={8}>
              <UIStatistic
                title="Net Growth"
                value={(stats?.totalVectorsUpserted ?? 0) - (stats?.totalVectorsDeleted ?? 0)}
                loading={isLoading}
                valueStyle={{
                  color: (stats?.totalVectorsUpserted ?? 0) > (stats?.totalVectorsDeleted ?? 0)
                    ? 'var(--success)'
                    : 'var(--error)'
                }}
              />
            </UICol>
          </UIRow>
        </UICard>

        {/* Daily Usage Chart */}
        <UIStatisticsChart
          data={dailyStats}
          loading={dailyStatsLoading}
          title="Daily VectorStore Operations"
          metrics={[
            { key: 'totalSearches', label: 'Searches' },
            { key: 'totalUpserts', label: 'Upserts' },
            { key: 'totalDeletes', label: 'Deletes' },
          ]}
        />
      </div>
    </UIPage>
  );
}
