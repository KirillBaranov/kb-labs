import { useState } from 'react';
import { UIRow, UICol, UIStatistic, UIAlert, UIProgress, useUITheme } from '@kb-labs/studio-ui-kit';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { UIText, UIStatisticsChart, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { useAdaptersCacheUsage, useAdaptersCacheDailyStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { AnalyticsDateRangePicker, type DateRangeValue } from '../components/analytics-date-range-picker';
import dayjs from 'dayjs';


/**
 * Analytics Cache Usage Page
 *
 * Displays cache usage statistics:
 * - Hit/miss rates
 * - Performance metrics
 * - Cache efficiency
 */
export function AnalyticsCachePage() {
  const { token } = useUITheme();
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
  } = useAdaptersCacheUsage(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useAdaptersCacheDailyStats(sources.adapters, {
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
          title="Cache Usage"
          description="Track cache hit rates and performance optimization"
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
        <UIPageHeader title="Cache Usage" description="Cache usage analytics" />
        <UIAlert
          message="Failed to Load Cache Usage"
          description={error?.message || 'Unknown error occurred'}
          variant="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  const hitRateStatus = stats && stats.hitRate >= 80
    ? 'success'
    : stats && stats.hitRate >= 60
    ? 'normal'
    : 'exception';

  const missRate = stats ? (100 - stats.hitRate).toFixed(1) : 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Cache Usage Analytics"
        description="Track cache efficiency, hit rates, and performance optimization opportunities"
        actions={
          <AnalyticsDateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        }
      />

      <div style={{ marginTop: 24 }}>
        {/* Hit Rate Overview */}
        <UIRow gutter={[16, 16]}>
          <UICol xs={24}>
            <UICard>
              <UIRow gutter={[16, 16]} align="middle">
                <UICol xs={24} lg={8}>
                  <div style={{ textAlign: 'center' }}>
                    <UIProgress
                      type="circle"
                      percent={Number((stats?.hitRate ?? 0).toFixed(1))}
                      status={hitRateStatus}
                      size={180}
                      format={(percent) => (
                        <div>
                          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{percent}%</div>
                          <div style={{ fontSize: '14px', color: token.colorTextTertiary }}>Hit Rate</div>
                        </div>
                      )}
                    />
                  </div>
                </UICol>
                <UICol xs={24} lg={16}>
                  <UIRow gutter={[16, 16]}>
                    <UICol xs={12}>
                      <UIStatistic
                        title="Total Gets"
                        value={stats?.totalGets ?? 0}
                        prefix={<EyeOutlined />}
                        loading={isLoading}
                        valueStyle={{ color: 'var(--info)' }}
                      />
                    </UICol>
                    <UICol xs={12}>
                      <UIStatistic
                        title="Cache Hits"
                        value={stats?.hits ?? 0}
                        prefix={<CheckCircleOutlined />}
                        loading={isLoading}
                        valueStyle={{ color: 'var(--success)' }}
                      />
                    </UICol>
                    <UICol xs={12}>
                      <UIStatistic
                        title="Cache Misses"
                        value={stats?.misses ?? 0}
                        prefix={<CloseCircleOutlined />}
                        loading={isLoading}
                        valueStyle={{ color: 'var(--error)' }}
                      />
                    </UICol>
                    <UICol xs={12}>
                      <UIStatistic
                        title="Miss Rate"
                        value={Number(missRate)}
                        suffix="%"
                        precision={1}
                        loading={isLoading}
                        valueStyle={{ color: 'var(--warning)' }}
                      />
                    </UICol>
                  </UIRow>
                </UICol>
              </UIRow>
            </UICard>
          </UICol>
        </UIRow>

        {/* Performance Metrics */}
        <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
          <UICol xs={24} lg={12}>
            <UICard title="Read Performance">
              <UIStatistic
                title="Avg Get Duration"
                value={stats?.avgGetDuration ?? 0}
                prefix={<ClockCircleOutlined />}
                suffix="ms"
                precision={2}
                loading={isLoading}
              />
              <div style={{ marginTop: 16 }}>
                <UIText color="secondary">
                  Average time to retrieve cached values
                  {stats && stats.avgGetDuration < 5 && (
                    <CheckCircleOutlined style={{ color: 'var(--success)', marginLeft: 8 }} />
                  )}
                </UIText>
              </div>
            </UICard>
          </UICol>
          <UICol xs={24} lg={12}>
            <UICard title="Write Performance">
              <UIStatistic
                title="Cache Sets"
                value={stats?.sets ?? 0}
                prefix={<SaveOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--link)' }}
              />
              <div style={{ marginTop: 16 }}>
                <UIStatistic
                  title="Avg Set Duration"
                  value={stats?.avgSetDuration ?? 0}
                  prefix={<ClockCircleOutlined />}
                  suffix="ms"
                  precision={2}
                  loading={isLoading}
                />
              </div>
            </UICard>
          </UICol>
        </UIRow>

        {/* Efficiency Insights */}
        {stats && stats.totalGets > 0 && (
          <UICard title="Cache Efficiency Insights" style={{ marginTop: 16 }}>
            <UIRow gutter={[16, 16]}>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Gets per Set"
                  value={(stats.totalGets / Math.max(stats.sets, 1)).toFixed(2)}
                  loading={isLoading}
                  valueStyle={{ color: 'var(--info)' }}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  Higher is better (more cache reuse)
                </UIText>
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Performance Gain"
                  value={stats.avgSetDuration > 0 ? (stats.avgSetDuration / Math.max(stats.avgGetDuration, 0.1)).toFixed(1) : 0}
                  suffix="x"
                  loading={isLoading}
                  valueStyle={{ color: 'var(--success)' }}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  Set is ~{stats.avgSetDuration > 0 ? (stats.avgSetDuration / Math.max(stats.avgGetDuration, 0.1)).toFixed(1) : 0}x slower than get
                </UIText>
              </UICol>
              <UICol xs={24} sm={8}>
                <UIStatistic
                  title="Cache Effectiveness"
                  value={stats.hits > 0 ? ((stats.hits / stats.totalGets) * 100).toFixed(1) : 0}
                  suffix="%"
                  loading={isLoading}
                  valueStyle={{
                    color: stats.hitRate >= 80 ? 'var(--success)' : stats.hitRate >= 60 ? 'var(--info)' : 'var(--warning)'
                  }}
                />
                <UIText color="secondary" style={{ fontSize: 12 }}>
                  {stats.hitRate >= 80 ? 'Excellent' : stats.hitRate >= 60 ? 'Good' : 'Needs improvement'}
                </UIText>
              </UICol>
            </UIRow>
          </UICard>
        )}

        {/* Daily Usage Chart */}
        <UIStatisticsChart
          data={dailyStats}
          loading={dailyStatsLoading}
          title="Daily Cache Performance"
          metrics={[
            { key: 'totalHits', label: 'Hits' },
            { key: 'totalMisses', label: 'Misses' },
            { key: 'hitRate', label: 'Hit Rate (%)', format: (v) => `${v.toFixed(1)}%` },
          ]}
        />
      </div>
    </UIPage>
  );
}
