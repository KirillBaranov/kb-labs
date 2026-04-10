import { UICard, UIBadge, UIRow, UICol } from '@kb-labs/studio-ui-kit';
import { HolderOutlined } from '@ant-design/icons';
import { useRegistryV2 } from '../../../providers/registry-v2-provider';
import { KBStatCard } from '@/components/ui';

export function DashboardKpisWidget() {
  const { registry } = useRegistryV2();
  const health = null as { pluginsMounted: number; pluginsFailed: number; ready: boolean; redisHealthy: boolean; redisEnabled: boolean } | null; // TODO: health status via separate endpoint

  const totalPlugins = registry.plugins?.length ?? 0;
  const pluginsMounted = health?.pluginsMounted ?? 0;
  const pluginsFailed = health?.pluginsFailed ?? 0;
  const systemStatus = health?.ready ? 'Healthy' : 'Degraded';
  const statusType = health?.ready ? 'success' : 'error';

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HolderOutlined className="drag-handle" style={{ cursor: 'grab', color: 'var(--text-tertiary)' }} />
          <span>System Status</span>
          <UIBadge variant={statusType as 'success' | 'error'} />
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, padding: '16px' } }}
    >
      <UIRow gutter={[16, 16]} style={{ height: '100%' }}>
        <UICol span={6}>
          <KBStatCard
            label="Status"
            value={systemStatus}
            variant={health?.ready ? 'positive' : 'negative'}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Plugins Mounted"
            value={`${pluginsMounted} of ${totalPlugins}`}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Failed"
            value={pluginsFailed.toString()}
            variant={pluginsFailed > 0 ? 'negative' : 'positive'}
          />
        </UICol>
        <UICol span={6}>
          <KBStatCard
            label="Redis"
            value={health?.redisHealthy ? 'Healthy' : health?.redisEnabled ? 'Unhealthy' : 'Disabled'}
            variant={health?.redisHealthy ? 'positive' : health?.redisEnabled ? 'negative' : 'default'}
          />
        </UICol>
      </UIRow>
    </UICard>
  );
}
