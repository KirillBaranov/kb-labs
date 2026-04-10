import { useState, useMemo } from 'react';
import { UIRow, UICol, UIStatistic, UIAlert, UITable, UISpace, UISelect, useUITheme } from '@kb-labs/studio-ui-kit';
import {
  RobotOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { UIText, UIStatisticsChart, UICard, UITag, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { useAdaptersLLMUsage, useAdaptersLLMDailyStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { AnalyticsDateRangePicker, type DateRangeValue } from '../components/analytics-date-range-picker';
import { formatCost, formatNumber, formatDuration } from '../utils/formatters';
import dayjs from 'dayjs';


/**
 * Analytics LLM Usage Page
 *
 * Displays LLM usage statistics:
 * - Total requests, tokens, and costs
 * - Breakdown by model
 * - Performance metrics (avg duration)
 * - Error rates
 */
export function AnalyticsLLMPage() {
  const { token } = useUITheme();
  const sources = useDataSources();

  // Date range state (default: last 30 days)
  const [dateRange, setDateRange] = useState<DateRangeValue>([
    dayjs().subtract(30, 'days'),
    dayjs(),
  ]);

  // Selected models state (empty = all models)
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const {
    data: usageData,
    isLoading,
    error,
    isError,
  } = useAdaptersLLMUsage(sources.adapters, {
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
  });

  // Fetch daily stats for time-series chart
  // Memoize query options to prevent unnecessary re-fetches
  const dailyStatsOptions = useMemo(() => ({
    from: dateRange[0].toISOString(),
    to: dateRange[1].toISOString(),
    models: selectedModels.length > 0 ? selectedModels : undefined,
  }), [dateRange, selectedModels]);

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useAdaptersLLMDailyStats(sources.adapters, dailyStatsOptions);

  // Check if analytics is not implemented
  const analyticsNotImplemented =
    isError &&
    error instanceof Error &&
    (error.message.includes('not support') || error.message.includes('not implement'));

  const llmChart = useMemo(() => (
    <UIStatisticsChart
      data={dailyStats}
      loading={dailyStatsLoading}
      title="" // Empty title since we have it in the card
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
      style={{ marginTop: 0 }}
    />
  ), [dailyStats, dailyStatsLoading]);

  if (analyticsNotImplemented) {
    return (
      <UIPage>
        <UIPageHeader
          title="LLM Usage"
          description="Track LLM API usage, costs, and performance"
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
        <UIPageHeader title="LLM Usage" description="LLM usage analytics" />
        <UIAlert
          message="Failed to Load LLM Usage"
          description={error?.message || 'Unknown error occurred'}
          variant="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  const stats = usageData;

  // Prepare table data
  const tableData = stats
    ? Object.entries(stats.byModel).map(([model, modelStats]) => ({
        key: model,
        model,
        ...modelStats,
      }))
    : [];

  const columns = [
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      width: 200,
      fixed: 'left' as const,
      render: (model: string) => (
        <UISpace>
          <RobotOutlined />
          <UIText weight="semibold">{model}</UIText>
        </UISpace>
      ),
    },
    {
      title: 'Requests',
      dataIndex: 'requests',
      key: 'requests',
      width: 100,
      render: (val: number) => formatNumber(val),
      sorter: (a: any, b: any) => a.requests - b.requests,
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 100,
      render: (val: number) => (
        <UIText weight="semibold" style={{ color: 'var(--error)' }}>
          {formatCost(val)}
        </UIText>
      ),
      sorter: (a: any, b: any) => a.cost - b.cost,
    },
    {
      title: 'Tokens/Request',
      dataIndex: 'tokensPerRequest',
      key: 'tokensPerRequest',
      width: 130,
      render: (val: number) => (
        <UIText weight="semibold">{formatNumber(Math.round(val))}</UIText>
      ),
      sorter: (a: any, b: any) => a.tokensPerRequest - b.tokensPerRequest,
    },
    {
      title: 'Cost/1K Tokens',
      dataIndex: 'costPer1KTokens',
      key: 'costPer1KTokens',
      width: 130,
      render: (val: number) => (
        <UIText style={{ color: 'var(--info)' }}>
          {formatCost(val)}
        </UIText>
      ),
      sorter: (a: any, b: any) => a.costPer1KTokens - b.costPer1KTokens,
    },
    {
      title: 'Error Rate',
      dataIndex: 'errorRate',
      key: 'errorRate',
      width: 100,
      render: (val: number) => {
        const color = val === 0 ? token.colorSuccess : val < 1 ? token.colorWarning : token.colorError;
        return (
          <UIText weight="semibold" style={{ color }}>
            {val.toFixed(2)}%
          </UIText>
        );
      },
      sorter: (a: any, b: any) => a.errorRate - b.errorRate,
    },
    {
      title: 'Total Tokens',
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      width: 120,
      render: (val: number) => formatNumber(val),
      sorter: (a: any, b: any) => a.totalTokens - b.totalTokens,
    },
    {
      title: 'Avg Duration',
      dataIndex: 'avgDurationMs',
      key: 'avgDurationMs',
      width: 120,
      render: (val: number) => (
        <UISpace>
          <ClockCircleOutlined />
          {formatDuration(val)}
        </UISpace>
      ),
      sorter: (a: any, b: any) => a.avgDurationMs - b.avgDurationMs,
    },
    {
      title: 'Prompt Tokens',
      dataIndex: 'promptTokens',
      key: 'promptTokens',
      width: 130,
      render: (val: number) => <UIText color="secondary">{formatNumber(val)}</UIText>,
    },
    {
      title: 'Completion Tokens',
      dataIndex: 'completionTokens',
      key: 'completionTokens',
      width: 150,
      render: (val: number) => <UIText color="secondary">{formatNumber(val)}</UIText>,
    },
    {
      title: 'Cache Tokens',
      dataIndex: 'cacheReadTokens',
      key: 'cacheReadTokens',
      width: 130,
      render: (val: number | undefined) => {
        const n = val ?? 0;
        return (
          <UIText style={{ color: n > 0 ? 'var(--info)' : undefined }} color={n > 0 ? undefined : 'secondary'}>
            {formatNumber(n)}
          </UIText>
        );
      },
      sorter: (a: any, b: any) => (a.cacheReadTokens ?? 0) - (b.cacheReadTokens ?? 0),
    },
    {
      title: 'Billable Tokens',
      dataIndex: 'billableTokens',
      key: 'billableTokens',
      width: 140,
      render: (val: number | undefined) => <UIText color="secondary">{formatNumber(val ?? 0)}</UIText>,
      sorter: (a: any, b: any) => (a.billableTokens ?? 0) - (b.billableTokens ?? 0),
    },
    {
      title: 'Cache Savings',
      dataIndex: 'cacheSavingsUsd',
      key: 'cacheSavingsUsd',
      width: 130,
      render: (val: number | undefined) => {
        const n = val ?? 0;
        return (
          <UIText weight="semibold" style={{ color: n > 0 ? 'var(--success)' : undefined }} color={n > 0 ? undefined : 'secondary'}>
            {n > 0 ? `+${formatCost(n)}` : formatCost(n)}
          </UIText>
        );
      },
      sorter: (a: any, b: any) => (a.cacheSavingsUsd ?? 0) - (b.cacheSavingsUsd ?? 0),
    },
  ];

  return (
    <UIPage width="full">
      <UIPageHeader
        title="LLM Usage Analytics"
        description="Track LLM API usage, costs, and performance across all models"
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
                title="Total Requests"
                value={stats?.totalRequests ?? 0}
                prefix={<ThunderboltOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--info)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Total Tokens"
                value={stats?.totalTokens ?? 0}
                prefix={<RobotOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--success)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Total Cost"
                value={stats?.totalCost ?? 0}
                prefix={<DollarOutlined />}
                precision={4}
                loading={isLoading}
                valueStyle={{ color: 'var(--error)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Errors"
                value={stats?.errors ?? 0}
                prefix={<WarningOutlined />}
                loading={isLoading}
                valueStyle={{ color: stats && stats.errors > 0 ? 'var(--warning)' : 'var(--success)' }}
              />
            </UICard>
          </UICol>
        </UIRow>

        {/* Cache Savings Row */}
        <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
          <UICol xs={24} sm={12} lg={8}>
            <UICard>
              <UIStatistic
                title="Cache Read Tokens"
                value={stats?.totalCacheReadTokens ?? 0}
                prefix={<SaveOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--info)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={8}>
            <UICard>
              <UIStatistic
                title="Billable Tokens"
                value={stats?.totalBillableTokens ?? 0}
                prefix={<RobotOutlined />}
                loading={isLoading}
                valueStyle={{ color: 'var(--warning)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={8}>
            <UICard>
              <UIStatistic
                title="Cache Savings"
                value={stats?.totalCacheSavingsUsd ?? 0}
                prefix={<DollarOutlined />}
                precision={4}
                loading={isLoading}
                valueStyle={{ color: 'var(--success)' }}
              />
            </UICard>
          </UICol>
        </UIRow>

        {/* Model Breakdown Table */}
        <UICard
          title="Usage by Model"
          style={{ marginTop: 16 }}
          extra={
            stats && (
              <UITag color="blue">
                {Object.keys(stats.byModel).length} model(s)
              </UITag>
            )
          }
        >
          <UITable
            columns={columns}
            dataSource={tableData}
            loading={isLoading}
            pagination={false}
            size="middle"
            scroll={{ x: 'max-content' }}
          />
        </UICard>

        {/* Daily Usage Chart */}
        <UICard title="Daily Usage Trend" style={{ marginTop: 16 }} key="daily-usage-chart">
          {/* Model Filter */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <UIText weight="medium">Filter by models:</UIText>
            <UISelect
              mode="multiple"
              placeholder="All models"
              style={{ minWidth: 300, maxWidth: 600, flex: 1 }}
              value={selectedModels}
              onChange={(v) => setSelectedModels(v as string[])}
              allowClear
              showSearch
              maxTagCount="responsive"
              options={stats ? Object.keys(stats.byModel).map((model) => ({
                label: `${model} (${formatNumber(stats.byModel[model]!.requests)} requests)`,
                value: model,
              })) : []}
            />
          </div>

          {/* Chart - fixed height container to prevent scroll jumps */}
          <div style={{ minHeight: 420 }}>
            {llmChart}
          </div>
        </UICard>
      </div>
    </UIPage>
  );
}
