import {
  UIRow,
  UICol,
  UITable,
  UICard,
  UIStatistic,
  UIAlert,
  UITag,
  UIProgress,
  UITimeline,
  UIBadge,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { usePrometheusMetrics } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { PluginMetrics, TenantMetrics } from '@kb-labs/studio-data-client';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import { AnalyticsSummaryStrip } from '../../analytics/components/analytics-summary-strip';

/**
 * Format uptime duration to human-readable string
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format number with optional decimal places
 */
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}

/**
 * Get status code color
 */
function getStatusCodeColor(code: number): string {
  if (code >= 500) {return 'var(--error)';} // red
  if (code >= 400) {return 'var(--warning)';} // orange
  if (code >= 300) {return 'var(--info)';} // blue
  return 'var(--success)'; // green
}

/**
 * Prometheus Metrics Observability Page
 *
 * Shows real-time metrics parsed from the canonical REST API /metrics endpoint:
 * - Request counts and error rates
 * - Latency percentiles (p50, p95, p99)
 * - Per-plugin and per-tenant breakdown
 * - Redis health status
 * - Plugin mount statistics
 */
export function PrometheusMetricsPage() {
  const sources = useDataSources();
  const { data, isLoading, error, isError } = usePrometheusMetrics(sources.observability);

  if (isError) {
    return (
      <UIPage>
        <UIPageHeader
          title="Prometheus Metrics"
          description="REST API performance and health metrics"
        />
        <UIAlert
          message="Failed to load Prometheus metrics"
          description={error instanceof Error ? error.message : 'Unknown error. Make sure REST API is running on localhost:5050'}
          variant="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      </UIPage>
    );
  }

  if (isLoading || !data) {
    return (
      <UIPage>
        <UIPageHeader
          title="Prometheus Metrics"
          description="REST API performance and health metrics"
        />
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          Loading...
        </div>
      </UIPage>
    );
  }

  const errorRate = data.requests?.total > 0
    ? (((data.requests.clientErrors ?? 0) + (data.requests.serverErrors ?? 0)) / data.requests.total) * 100
    : 0;

  const successRate = data.requests?.total > 0
    ? ((data.requests.success ?? 0) / data.requests.total) * 100
    : 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Prometheus Metrics"
        description="REST API performance metrics - Auto-refresh every 10s"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {/* Headline — the numbers you check first: how much traffic, how fast, how broken */}
        <AnalyticsSummaryStrip
          metrics={[
            { label: 'Total Requests', value: data.requests?.total ?? 0 },
            { label: 'Avg Latency (p50)', value: `${formatNumber(data.latency?.p50 ?? 0, 1)}ms` },
            { label: 'Error Rate', value: `${formatNumber(errorRate, 1)}%`, valueColor: errorRate > 5 ? 'var(--error)' : undefined },
            { label: 'Uptime', value: formatUptime(data.uptime?.seconds ?? 0) },
          ]}
        />

        {/* Latency Percentiles */}
        <UIRow gutter={[16, 16]}>
        <UICol xs={24} lg={12}>
          <UICard title="Latency Percentiles" extra={<UIIcon name="ThunderboltOutlined" style={{ color: 'var(--info)' }} />}>
            <UIRow gutter={16}>
              <UICol span={8}>
                <UIStatistic
                  title="p50 (Median)"
                  value={formatNumber(data.latency?.p50 ?? 0, 1)}
                  suffix="ms"
                  valueStyle={{ fontSize: 20 }}
                />
              </UICol>
              <UICol span={8}>
                <UIStatistic
                  title="p95"
                  value={formatNumber(data.latency?.p95 ?? 0, 1)}
                  suffix="ms"
                  valueStyle={{ fontSize: 20, color: (data.latency?.p95 ?? 0) > 200 ? 'var(--warning)' : 'var(--success)' }}
                />
              </UICol>
              <UICol span={8}>
                <UIStatistic
                  title="p99"
                  value={formatNumber(data.latency?.p99 ?? 0, 1)}
                  suffix="ms"
                  valueStyle={{ fontSize: 20, color: (data.latency?.p99 ?? 0) > 500 ? 'var(--error)' : 'var(--warning)' }}
                />
              </UICol>
            </UIRow>
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Min: {formatNumber(data.latency?.min ?? 0, 1)}ms | Max: {formatNumber(data.latency?.max ?? 0, 1)}ms | Avg: {formatNumber(data.latency?.average ?? 0, 1)}ms
            </div>
          </UICard>
        </UICol>

        <UICol xs={24} lg={12}>
          <UICard title="Success Rate" extra={<UIIcon name="CheckCircleOutlined" style={{ color: successRate >= 95 ? 'var(--success)' : 'var(--warning)' }} />}>
            <UIProgress
              percent={Math.round(successRate)}
              status={successRate >= 95 ? 'success' : successRate >= 90 ? 'normal' : 'exception'}
              strokeColor={successRate >= 95 ? 'var(--success)' : successRate >= 90 ? 'var(--info)' : 'var(--error)'}
            />
            <div style={{ marginTop: 16 }}>
              <UIRow gutter={16}>
                <UICol span={8}>
                  <UIStatistic
                    title="Success"
                    value={data.requests?.success ?? 0}
                    valueStyle={{ fontSize: 18, color: 'var(--success)' }}
                  />
                </UICol>
                <UICol span={8}>
                  <UIStatistic
                    title="4xx Errors"
                    value={data.requests?.clientErrors ?? 0}
                    valueStyle={{ fontSize: 18, color: 'var(--warning)' }}
                  />
                </UICol>
                <UICol span={8}>
                  <UIStatistic
                    title="5xx Errors"
                    value={data.requests?.serverErrors ?? 0}
                    valueStyle={{ fontSize: 18, color: 'var(--error)' }}
                  />
                </UICol>
              </UIRow>
            </div>
          </UICard>
        </UICol>
      </UIRow>

      {/* Per-Plugin Metrics */}
      <UICard title="Per-Plugin Metrics">
        <UITable<{ key: string; plugin: string } & PluginMetrics>
          dataSource={(data.perPlugin ?? []).map((item) => ({
            key: item.pluginId,
            plugin: item.pluginId,
            ...item,
          }))}
          columns={[
            {
              title: 'Plugin',
              dataIndex: 'plugin',
              key: 'plugin',
              render: (plugin: string) => <UITag color="blue">{plugin}</UITag>,
            },
            {
              title: 'Requests',
              dataIndex: 'requests',
              key: 'requests',
              align: 'right' as const,
              sorter: (a, b) => a.requests - b.requests,
            },
            {
              title: 'Errors',
              dataIndex: 'errors',
              key: 'errors',
              align: 'right' as const,
              render: (errors: number) => (
                <span style={{ color: errors > 10 ? 'var(--error)' : errors > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {errors}
                </span>
              ),
            },
            {
              title: 'Avg Latency',
              key: 'avgLatency',
              align: 'right' as const,
              render: (_: unknown, record: PluginMetrics) =>
                record.latency ? `${formatNumber(record.latency.average, 1)} ms` : 'N/A',
              sorter: (a, b) => (a.latency?.average ?? 0) - (b.latency?.average ?? 0),
            },
            {
              title: 'Min / Max',
              key: 'minMax',
              align: 'right' as const,
              render: (_: unknown, record: PluginMetrics) =>
                record.latency ? (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {formatNumber(record.latency.min, 1)} / {formatNumber(record.latency.max, 1)} ms
                  </span>
                ) : <span>N/A</span>,
            },
          ]}
          pagination={false}
          size="small"
        />
      </UICard>

      {/* Per-Tenant Metrics */}
      <UICard title="Per-Tenant Metrics">
        <UITable<{ key: string; tenant: string } & TenantMetrics>
          dataSource={(data.perTenant ?? []).map((item) => ({
            key: item.tenantId,
            tenant: item.tenantId,
            ...item,
          }))}
          columns={[
            {
              title: 'Tenant',
              dataIndex: 'tenant',
              key: 'tenant',
              render: (tenant: string) => <UITag color="green">{tenant}</UITag>,
            },
            {
              title: 'Requests',
              dataIndex: 'requests',
              key: 'requests',
              align: 'right' as const,
            },
            {
              title: 'Errors',
              dataIndex: 'errors',
              key: 'errors',
              align: 'right' as const,
              render: (errors: number) => (
                <span style={{ color: errors > 50 ? 'var(--error)' : errors > 10 ? 'var(--warning)' : 'var(--success)' }}>
                  {errors}
                </span>
              ),
            },
            {
              title: 'Avg Latency',
              key: 'avgLatency',
              align: 'right' as const,
              render: (_: unknown, record: TenantMetrics) =>
                record.latency ? `${formatNumber(record.latency.average, 1)} ms` : 'N/A',
            },
            {
              title: 'Error Rate',
              key: 'errorRate',
              align: 'right' as const,
              render: (_: unknown, record: TenantMetrics) => {
                const rate = record.requests > 0 ? (record.errors / record.requests) * 100 : 0;
                return (
                  <span style={{ color: rate > 5 ? 'var(--error)' : rate > 2 ? 'var(--warning)' : 'var(--success)' }}>
                    {formatNumber(rate, 1)}%
                  </span>
                );
              },
            },
          ]}
          pagination={false}
          size="small"
        />
      </UICard>

      {/* Error Analytics */}
      <UIRow gutter={[16, 16]}>
        <UICol xs={24} lg={12}>
          <UICard title="Error Breakdown" extra={<UIIcon name="ExclamationCircleOutlined" style={{ color: 'var(--warning)' }} />}>
            <UIRow gutter={16}>
              {Object.entries(data.errors?.byStatusCode ?? {})
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([code, count]) => (
                  <UICol span={8} key={code}>
                    <UIStatistic
                      title={`${code} Errors`}
                      value={count}
                      valueStyle={{ fontSize: 18, color: getStatusCodeColor(Number(code)) }}
                    />
                  </UICol>
                ))}
            </UIRow>
            {Object.keys(data.errors?.byStatusCode ?? {}).length === 0 && (
              <UIAlert message="No errors recorded" variant="success" showIcon />
            )}
          </UICard>
        </UICol>

        <UICol xs={24} lg={12}>
          <UICard title="Recent Errors" extra={<UIBadge count={data.errors?.recent?.length ?? 0} />}>
            {data.errors?.recent && data.errors.recent.length > 0 ? (
              <UITimeline
                items={data.errors.recent.map((error) => ({
                  color: getStatusCodeColor(error.statusCode),
                  children: (
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        <UITag color={getStatusCodeColor(error.statusCode)}>{error.statusCode}</UITag>
                        {error.errorCode && <UITag>{error.errorCode}</UITag>}
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                          {formatRelativeTime(error.timestamp)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13 }}>{error.message}</div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <UIAlert message="No recent errors" variant="success" showIcon />
            )}
          </UICard>
        </UICol>
      </UIRow>

      {/* Redis Status & Plugin Mounts */}
      <UIRow gutter={[16, 16]}>
        <UICol xs={24} lg={12}>
          <UICard title="Redis Status" extra={<UIIcon name="DatabaseOutlined" style={{ color: data.redis.lastStatus?.healthy ? 'var(--success)' : 'var(--error)' }} />}>
            {data.redis.lastStatus ? (
              <>
                <UIRow gutter={16}>
                  <UICol span={12}>
                    <UIStatistic
                      title="Health"
                      value={data.redis.lastStatus.healthy ? 'Healthy' : 'Unhealthy'}
                      valueStyle={{ color: data.redis.lastStatus.healthy ? 'var(--success)' : 'var(--error)' }}
                    />
                  </UICol>
                  <UICol span={12}>
                    <UIStatistic
                      title="Role"
                      value={data.redis.lastStatus.role}
                      valueStyle={{ fontSize: 20 }}
                    />
                  </UICol>
                </UIRow>
                <div style={{ marginTop: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    State: <strong>{data.redis.lastStatus.state}</strong>
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Healthy transitions: {data.redis.healthyTransitions} | Unhealthy: {data.redis.unhealthyTransitions}
                  </p>
                </div>
              </>
            ) : (
              <UIAlert message="No Redis status data available" variant="info" showIcon />
            )}
          </UICard>
        </UICol>

        <UICol xs={24} lg={12}>
          <UICard title="Plugin Mounts">
            {data.pluginMounts ? (
              <>
                <UIRow gutter={16}>
                  <UICol span={8}>
                    <UIStatistic
                      title="Total"
                      value={data.pluginMounts.total}
                      valueStyle={{ fontSize: 20 }}
                    />
                  </UICol>
                  <UICol span={8}>
                    <UIStatistic
                      title="Succeeded"
                      value={data.pluginMounts.succeeded}
                      valueStyle={{ fontSize: 20, color: 'var(--success)' }}
                    />
                  </UICol>
                  <UICol span={8}>
                    <UIStatistic
                      title="Failed"
                      value={data.pluginMounts.failed}
                      valueStyle={{ fontSize: 20, color: data.pluginMounts.failed > 0 ? 'var(--error)' : 'var(--success)' }}
                    />
                  </UICol>
                </UIRow>
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Elapsed time: {formatNumber(data.pluginMounts.elapsedMs, 0)}ms
                </div>
              </>
            ) : (
              <UIAlert message="No plugin mount data available" variant="info" showIcon />
            )}
          </UICard>
        </UICol>
      </UIRow>
      </div>
    </UIPage>
  );
}
