import { UICard } from '@kb-labs/studio-ui-kit';
import { UITable } from '@kb-labs/studio-ui-kit';
import { HolderOutlined } from '@ant-design/icons';
import { usePrometheusMetrics } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';

export function DashboardPluginsWidget() {
  const sources = useDataSources();
  const { data: metrics } = usePrometheusMetrics(sources.observability);

  const columns = [
    {
      title: 'Plugin',
      dataIndex: 'pluginId',
      key: 'pluginId',
      render: (text: string) => text || 'unknown',
    },
    {
      title: 'Requests',
      dataIndex: 'total',
      key: 'total',
      sorter: (a: any, b: any) => a.total - b.total,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Avg (ms)',
      dataIndex: 'avgDuration',
      key: 'avgDuration',
      render: (value: number) => value.toFixed(0),
    },
    {
      title: 'Max (ms)',
      dataIndex: 'maxDuration',
      key: 'maxDuration',
      render: (value: number) => value.toFixed(0),
    },
  ];

  const dataSource = metrics?.perPlugin?.map((plugin, index) => ({
    key: plugin.pluginId || `plugin-${index}`,
    pluginId: plugin.pluginId,
    total: plugin.requests,
    avgDuration: plugin.latency.average,
    maxDuration: plugin.latency.max,
  })) ?? [];

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HolderOutlined className="drag-handle" style={{ cursor: 'grab', color: 'var(--text-tertiary)' }} />
          <span>Plugin Performance</span>
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, padding: '16px', overflow: 'auto' } }}
    >
      <UITable
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
      />

    </UICard>
  );
}
