import { useState } from 'react';
import { UIRow, UICol, UIStatistic, UIAlert } from '@kb-labs/studio-ui-kit';
import {
  FileOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { UIText, UIStatisticsChart, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { useAdaptersStorageUsage, useAdaptersStorageDailyStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { AnalyticsDateRangePicker, type DateRangeValue } from '../components/analytics-date-range-picker';
import dayjs from 'dayjs';


/**
 * Analytics Storage Usage Page
 *
 * Displays storage usage statistics:
 * - Read/write/delete operations
 * - Bandwidth usage tracking
 * - Performance metrics
 */
export function AnalyticsStoragePage() {
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
  } = useAdaptersStorageUsage(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useAdaptersStorageDailyStats(sources.adapters, {
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
          title="Storage Usage"
          description="Track storage operations and bandwidth usage"
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
        <UIPageHeader title="Storage Usage" description="Storage usage analytics" />
        <UIAlert
          message="Failed to Load Storage Usage"
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
  const formatSize = (bytes: number) => {
    if (bytes < 1024) {return `${bytes} B`;}
    if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(2)} KB`;}
    if (bytes < 1024 * 1024 * 1024) {return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;}
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  const _formatDuration = (ms: number) => (ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`);

  const totalOperations = stats
    ? stats.readOperations + stats.writeOperations + stats.deleteOperations
    : 0;

  const readPercentage = stats && totalOperations > 0
    ? ((stats.readOperations / totalOperations) * 100).toFixed(1)
    : 0;

  const writePercentage = stats && totalOperations > 0
    ? ((stats.writeOperations / totalOperations) * 100).toFixed(1)
    : 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Storage Usage Analytics"
        description="Track storage operations, bandwidth usage, and file I/O performance"
        actions={
          <AnalyticsDateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        }
      />

      <div style={{ marginTop: 24 }}>
        {/* Operations Overview */}
        <UIRow gutter={[16, 16]}>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Read Operations"
                value={stats?.readOperations ?? 0}
                prefix={<DownloadOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--info)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Write Operations"
                value={stats?.writeOperations ?? 0}
                prefix={<UploadOutlined />}
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
                valueStyle={{ color: 'var(--error)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Total Operations"
                value={totalOperations}
                prefix={<FileOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--link)' }}
              />
            </UICard>
          </UICol>
        </UIRow>

        {/* Bandwidth Usage */}
        <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
          <UICol xs={24} lg={12}>
            <UICard title="Bandwidth Usage">
              <UIRow gutter={[16, 16]}>
                <UICol span={12}>
                  <UIStatistic
                    title="Total Read"
                    value={formatSize(stats?.totalBytesRead ?? 0)}
                    prefix={<DownloadOutlined />}
                    loading={isLoading}
                    valueStyle={{ color: 'var(--info)' }}
                  />
                </UICol>
                <UICol span={12}>
                  <UIStatistic
                    title="Total Written"
                    value={formatSize(stats?.totalBytesWritten ?? 0)}
                    prefix={<UploadOutlined />}
                    loading={isLoading}
                    valueStyle={{ color: 'var(--success)' }}
                  />
                </UICol>
              </UIRow>
              <div style={{ marginTop: 16 }}>
                <UIStatistic
                  title="Total Bandwidth"
                  value={formatSize((stats?.totalBytesRead ?? 0) + (stats?.totalBytesWritten ?? 0))}
                  prefix={<DatabaseOutlined />}
                  loading={isLoading}
                  valueStyle={{ color: 'var(--link)' }}
                />
              </div>
            </UICard>
          </UICol>
          <UICol xs={24} lg={12}>
            <UICard title="Performance Metrics">
              <UIRow gutter={[16, 16]}>
                <UICol span={12}>
                  <UIStatistic
                    title="Avg Read Duration"
                    value={stats?.avgReadDuration ?? 0}
                    prefix={<ClockCircleOutlined />}
                    suffix="ms"
                    precision={1}
                    loading={isLoading}
                  />
                </UICol>
                <UICol span={12}>
                  <UIStatistic
                    title="Avg Write Duration"
                    value={stats?.avgWriteDuration ?? 0}
                    prefix={<ClockCircleOutlined />}
                    suffix="ms"
                    precision={1}
                    loading={isLoading}
                  />
                </UICol>
              </UIRow>
            </UICard>
          </UICol>
        </UIRow>

        {/* Operation Statistics */}
        {stats && totalOperations > 0 && (
          <UICard title="Operation Statistics" style={{ marginTop: 16 }}>
            <UIRow gutter={[16, 16]}>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Read Ratio"
                  value={Number(readPercentage)}
                  suffix="%"
                  precision={1}
                  loading={isLoading}
                  valueStyle={{ color: 'var(--info)' }}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  {readPercentage}% of total operations
                </UIText>
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Write Ratio"
                  value={Number(writePercentage)}
                  suffix="%"
                  precision={1}
                  loading={isLoading}
                  valueStyle={{ color: 'var(--success)' }}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  {writePercentage}% of total operations
                </UIText>
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Avg Read Size"
                  value={formatSize(stats.totalBytesRead / Math.max(stats.readOperations, 1))}
                  loading={isLoading}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  Per read operation
                </UIText>
              </UICol>
            </UIRow>
            <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Avg Write Size"
                  value={formatSize(stats.totalBytesWritten / Math.max(stats.writeOperations, 1))}
                  loading={isLoading}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  Per write operation
                </UIText>
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Read Throughput"
                  value={
                    stats.avgReadDuration > 0
                      ? formatSize((stats.totalBytesRead / Math.max(stats.readOperations, 1)) / (stats.avgReadDuration / 1000))
                      : '0 B'
                  }
                  suffix="/s"
                  loading={isLoading}
                  valueStyle={{ color: 'var(--info)' }}
                />
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Write Throughput"
                  value={
                    stats.avgWriteDuration > 0
                      ? formatSize((stats.totalBytesWritten / Math.max(stats.writeOperations, 1)) / (stats.avgWriteDuration / 1000))
                      : '0 B'
                  }
                  suffix="/s"
                  loading={isLoading}
                  valueStyle={{ color: 'var(--success)' }}
                />
              </UICol>
            </UIRow>
          </UICard>
        )}

        {/* Daily Usage Chart */}
        <UIStatisticsChart
          data={dailyStats}
          loading={dailyStatsLoading}
          title="Daily Storage Activity"
          metrics={[
            {
              key: 'totalBytesRead',
              label: 'Bytes Read (MB)',
              transform: (v) => Math.floor(v / (1024 * 1024)),
              format: (v) => `${v} MB`,
            },
            {
              key: 'totalBytesWritten',
              label: 'Bytes Written (MB)',
              transform: (v) => Math.floor(v / (1024 * 1024)),
              format: (v) => `${v} MB`,
            },
          ]}
        />
      </div>
    </UIPage>
  );
}
