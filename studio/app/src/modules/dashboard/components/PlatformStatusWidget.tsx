import React from 'react';
import {
  UICard,
  UITag,
  UIAlert,
  UIEmptyState,
  UISkeleton,
  UIStatistic,
  UIRow,
  UICol,
} from '@kb-labs/studio-ui-kit';
import {
  CheckCircleOutlined,
  WarningOutlined,
  BugOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { usePlatformHealth } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';

export function PlatformStatusWidget() {
  const sources = useDataSources();
  const { data, isLoading } = usePlatformHealth(sources.system);

  const isHealthy = !data || data.status === 'healthy';
  const statusColor = isHealthy ? 'green' : 'orange';
  const statusLabel = data?.status ?? 'unknown';

  const failedComponents = (data?.components ?? []).filter(c => c.lastError);
  const registryDegraded = data?.registry.partial || data?.registry.stale;

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <DashboardOutlined />
      <span>Platform Status</span>
      {data && (
        <UITag color={statusColor} style={{ marginLeft: 4 }}>
          {statusLabel}
        </UITag>
      )}
    </div>
  );

  return (
    <UICard title={title} style={{ height: '100%' }}>
      {isLoading ? (
        <UISkeleton active lines={4} />
      ) : !data ? (
        <UIEmptyState
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
          description="Platform health unavailable"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <UIRow gutter={[16, 16]}>
            <UICol span={8}>
              <UIStatistic
                title="Total Plugins"
                value={data.registry.total}
                valueStyle={{ fontSize: 20 }}
              />
            </UICol>
            <UICol span={8}>
              <UIStatistic
                title="With REST"
                value={data.registry.withRest}
                valueStyle={{ fontSize: 20 }}
              />
            </UICol>
            <UICol span={8}>
              <UIStatistic
                title="With Studio"
                value={data.registry.withStudio}
                valueStyle={{ fontSize: 20 }}
              />
            </UICol>
          </UIRow>

          {registryDegraded && (
            <UIAlert
              variant="warning"
              showIcon
              icon={<WarningOutlined />}
              message={
                data.registry.stale
                  ? 'Registry snapshot is stale'
                  : 'Registry snapshot is partial'
              }
              description="Some plugins may not be fully loaded. Restart kb-dev to refresh."
            />
          )}

          {failedComponents.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                <BugOutlined style={{ marginRight: 4 }} />
                Plugin load errors
              </div>
              {failedComponents.map(c => (
                <div
                  key={c.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--error-bg, rgba(255,77,79,0.06))',
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {c.id}
                  </div>
                  <div style={{ color: 'var(--error)', wordBreak: 'break-all' }}>
                    {c.lastError}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!registryDegraded && failedComponents.length === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--success)',
                fontSize: 13,
                padding: '8px 0',
              }}
            >
              <CheckCircleOutlined />
              <span>All systems operational</span>
            </div>
          )}
        </div>
      )}
    </UICard>
  );
}
