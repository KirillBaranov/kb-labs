import { UICard, UIRow, UICol } from '@kb-labs/studio-ui-kit';
import { HolderOutlined } from '@ant-design/icons';
import { usePrometheusMetrics } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { KBStatCard } from '@/components/ui';

export function DashboardMetricsWidget() {
  const sources = useDataSources();
  const { data: metrics } = usePrometheusMetrics(sources.observability);

  const totalRequests = metrics?.requests?.total ?? 0;
  const totalErrors = (metrics?.requests?.clientErrors ?? 0) + (metrics?.requests?.serverErrors ?? 0);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const avgLatency = metrics?.latency?.average ?? 0;
  const p95 = metrics?.latency?.p95 ?? 0;
  const uptime = metrics?.uptime?.seconds ?? 0;

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HolderOutlined className="drag-handle" style={{ cursor: 'grab', color: 'var(--text-tertiary)' }} />
          <span>Performance Metrics</span>
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, padding: '16px' } }}
    >
      <UIRow gutter={[16, 16]} style={{ height: '100%' }}>
        <UICol span={6}>
          <KBStatCard
            label="Requests"
            value={totalRequests.toLocaleString()}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Error Rate"
            value={`${errorRate.toFixed(1)}%`}
            variant={errorRate > 5 ? 'negative' : errorRate > 1 ? 'warning' : 'positive'}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Latency (avg)"
            value={`${avgLatency.toFixed(1)}ms`}
            variant={avgLatency > 500 ? 'negative' : avgLatency > 200 ? 'warning' : 'positive'}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Latency (p95/p99)"
            value={`${p95.toFixed(1)}ms`}
            variant={p95 > 1000 ? 'negative' : p95 > 500 ? 'warning' : 'positive'}
          />
        </UICol>
      </UIRow>
      <UIRow gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <UICol span={6}>
          <KBStatCard
            label="Uptime"
            value={formatUptime(uptime)}
            variant="positive"
          />
        </UICol>
      </UIRow>
    </UICard>
  );
}
