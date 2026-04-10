import {
  UIRow,
  UICol,
  UITable,
  UICard,
  UIStatistic,
  UIProgress,
  UIAlert,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useStateBrokerStats } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { NamespaceStats } from '@kb-labs/studio-data-client';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

/**
 * Format uptime in milliseconds to human-readable string
 */
function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

/**
 * State Broker Observability Page
 *
 * Shows real-time statistics from the State Broker daemon:
 * - Cache hit/miss rates
 * - Namespace breakdown
 * - Uptime and entry counts
 */
export function StateBrokerPage() {
  const sources = useDataSources();
  const { data, isLoading, error, isError } = useStateBrokerStats(sources.observability);

  if (isError) {
    return (
      <UIPage>
        <UIPageHeader
          title="State Broker"
          description="In-memory cache statistics"
        />
        <UIAlert
          message="Failed to load State Broker stats"
          description={error instanceof Error ? error.message : 'Unknown error. Make sure State Daemon is running on localhost:7777'}
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
          title="State Broker"
          description="In-memory cache statistics"
        />
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          Loading...
        </div>
      </UIPage>
    );
  }

  const hitRatePercent = Math.round(data.hitRate * 100);
  const missRatePercent = Math.round(data.missRate * 100);

  return (
    <UIPage width="full">
      <UIPageHeader
        title="State Broker"
        description="In-memory cache statistics - Auto-refresh every 5s"
      />

      {/* Overview Stats */}
      <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <UICol xs={24} sm={12} lg={6}>
          <UICard>
            <UIStatistic
              title="Uptime"
              value={formatUptime(data.uptime)}
              prefix={<UIIcon name="ClockCircleOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol xs={24} sm={12} lg={6}>
          <UICard>
            <UIStatistic
              title="Cache Entries"
              value={data.totalEntries}
              prefix={<UIIcon name="DatabaseOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol xs={24} sm={12} lg={6}>
          <UICard>
            <UIStatistic
              title="Cache Size"
              value={formatBytes(data.totalSize)}
              prefix={<UIIcon name="DatabaseOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol xs={24} sm={12} lg={6}>
          <UICard>
            <UIStatistic
              title="Evictions"
              value={data.evictions}
              prefix={<UIIcon name="DeleteOutlined" />}
            />
          </UICard>
        </UICol>
      </UIRow>

      {/* Hit/Miss Rate */}
      <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <UICol xs={24} lg={12}>
          <UICard title="Cache Hit Rate" extra={<UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />}>
            <UIProgress
              percent={hitRatePercent}
              status={hitRatePercent >= 70 ? 'success' : hitRatePercent >= 50 ? 'normal' : 'exception'}
              strokeColor={hitRatePercent >= 70 ? '#52c41a' : hitRatePercent >= 50 ? '#1890ff' : '#ff4d4f'}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              {hitRatePercent >= 70 ? 'Excellent cache performance' :
               hitRatePercent >= 50 ? 'Good cache performance' :
               'Poor cache performance - consider increasing TTL'}
            </div>
          </UICard>
        </UICol>
        <UICol xs={24} lg={12}>
          <UICard title="Cache Miss Rate" extra={<UIIcon name="CloseCircleOutlined" style={{ color: '#ff4d4f' }} />}>
            <UIProgress
              percent={missRatePercent}
              status={missRatePercent <= 30 ? 'success' : missRatePercent <= 50 ? 'normal' : 'exception'}
              strokeColor={missRatePercent <= 30 ? '#52c41a' : missRatePercent <= 50 ? '#faad14' : '#ff4d4f'}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              {missRatePercent <= 30 ? 'Low miss rate - good cache efficiency' :
               missRatePercent <= 50 ? 'Moderate miss rate' :
               'High miss rate - cache not effective'}
            </div>
          </UICard>
        </UICol>
      </UIRow>

      {/* Namespaces Table */}
      <UICard title="Namespaces Breakdown" style={{ marginBottom: 24 }}>
        <UITable<{ key: string; name: string } & NamespaceStats>
          dataSource={Object.entries(data.namespaces).map(([name, stats]) => ({
            key: name,
            name,
            ...stats,
          }))}
          columns={[
            {
              title: 'Namespace',
              dataIndex: 'name',
              key: 'name',
              render: (name: string) => <strong>{name}</strong>,
            },
            {
              title: 'Entries',
              dataIndex: 'entries',
              key: 'entries',
              align: 'right' as const,
            },
            {
              title: 'Hits',
              dataIndex: 'hits',
              key: 'hits',
              align: 'right' as const,
              render: (hits: number) => (
                <span style={{ color: '#52c41a' }}>{hits}</span>
              ),
            },
            {
              title: 'Misses',
              dataIndex: 'misses',
              key: 'misses',
              align: 'right' as const,
              render: (misses: number) => (
                <span style={{ color: '#ff4d4f' }}>{misses}</span>
              ),
            },
            {
              title: 'Hit Rate',
              key: 'hitRate',
              align: 'right' as const,
              render: (_: unknown, record: { hits: number; misses: number }) => {
                const total = record.hits + record.misses;
                const rate = total > 0 ? (record.hits / total) * 100 : 0;
                return `${Math.round(rate)}%`;
              },
            },
            {
              title: 'Size',
              dataIndex: 'size',
              key: 'size',
              align: 'right' as const,
              render: (size: number) => formatBytes(size),
            },
          ]}
          pagination={false}
          size="small"
        />
      </UICard>
    </UIPage>
  );
}
