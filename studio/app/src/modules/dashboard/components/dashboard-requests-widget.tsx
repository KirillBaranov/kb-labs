import { HolderOutlined } from '@ant-design/icons';
import { UILineChart } from '@kb-labs/studio-ui-kit';
import { useHealthStatus } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { UISpin } from '@kb-labs/studio-ui-kit';
import { UICard } from '@kb-labs/studio-ui-kit';

export function DashboardRequestsWidget() {
  const sources = useDataSources();
  const { data: health, isLoading: loading } = useHealthStatus(sources.system);

  const chartData = (health?.snapshot?.topOperations ?? [])
    .slice(0, 10)
    .map((item) => ({
      route: item.operation.replace(/^http\./, ''),
      requests: item.count ?? 0,
    }));

  const config = {
    data: chartData,
    xField: 'route',
    yField: 'requests',
    smooth: true,
    height: 250,
    autoFit: true,
    point: {
      size: 5,
      shape: 'circle',
    },
    tooltip: {
      showCrosshairs: true,
      shared: true,
    },
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
  };

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HolderOutlined className="drag-handle" style={{ cursor: 'grab', color: 'var(--text-tertiary)' }} />
          <span>Top Operations</span>
          {loading && <UISpin size="small" />}
        </div>
      }
      style={{ height: '100%' }}
    >
      {chartData.length > 0 ? (
        <UILineChart {...config} />
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          No operation data available
        </div>
      )}
    </UICard>
  );
}
