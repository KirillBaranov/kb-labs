import React from 'react';
import {
  UIProgress,
  UIStatistic,
  UIRow,
  UICol,
  UITag,
  UIEmptyState,
  UICard,
} from '@kb-labs/studio-ui-kit';
import {
  CloudServerOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useHealthStatus } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';

function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {return `${days}d ${hours}h ${minutes}m`;}
  if (hours > 0) {return `${hours}h ${minutes}m`;}
  return `${minutes}m`;
}

function getMetricColor(value: number, warningThreshold: number, criticalThreshold: number): string {
  if (value >= criticalThreshold) {return 'var(--error)';}
  if (value >= warningThreshold) {return 'var(--warning)';}
  return 'var(--success)';
}

export function SystemResourcesWidget() {
  const sources = useDataSources();
  const healthQuery = useHealthStatus(sources.system);
  const snapshot = healthQuery.data?.snapshot;
  const resources = snapshot?.snapshot;
  const topOperations = snapshot?.topOperations ?? [];
  const state = snapshot?.state ?? 'insufficient_data';
  const cpuPercent = resources?.cpuPercent ?? 0;
  const rssBytes = resources?.rssBytes ?? 0;
  const heapUsedBytes = resources?.heapUsedBytes ?? 0;
  const eventLoopLagMs = resources?.eventLoopLagMs ?? 0;
  const activeOperations = resources?.activeOperations ?? 0;

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CloudServerOutlined />
          <span>Runtime Resources</span>
          {snapshot && (
            <UITag color={state === 'active' ? 'green' : state === 'partial_observability' ? 'orange' : 'red'}>
              {state}
            </UITag>
          )}
        </div>
      }
      style={{ height: '100%' }}
    >
      {healthQuery.isLoading ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
          Loading runtime resources...
        </div>
      ) : !snapshot || !resources ? (
        <UIEmptyState
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
          description="No runtime snapshot available"
          style={{ marginTop: 40 }}
        />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CloudServerOutlined style={{ fontSize: 18, color: 'var(--info)' }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{snapshot.instanceId}</span>
            <UITag color={snapshot.status === 'healthy' ? 'green' : snapshot.status === 'degraded' ? 'orange' : 'red'}>
              {snapshot.status}
            </UITag>
          </div>

          <UIRow gutter={[16, 16]}>
            <UICol span={12}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <ThunderboltOutlined style={{ color: getMetricColor(cpuPercent, 70, 90) }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>CPU Usage</span>
                </div>
                <UIProgress
                  percent={parseFloat(cpuPercent.toFixed(1))}
                  strokeColor={getMetricColor(cpuPercent, 70, 90)}
                  size="small"
                  format={(percent) => `${percent}%`}
                />
              </div>
            </UICol>

            <UICol span={12}>
              <UIStatistic
                title={
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <DatabaseOutlined style={{ marginRight: 4 }} />
                    RSS
                  </span>
                }
                value={formatBytes(rssBytes)}
                valueStyle={{ fontSize: 14 }}
              />
            </UICol>

            <UICol span={12}>
              <UIStatistic
                title={
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <DatabaseOutlined style={{ marginRight: 4 }} />
                    Heap Used
                  </span>
                }
                value={formatBytes(heapUsedBytes)}
                valueStyle={{ fontSize: 14 }}
              />
            </UICol>

            <UICol span={12}>
              <UIStatistic
                title={
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    Uptime
                  </span>
                }
                value={formatUptime(snapshot.uptimeSec)}
                valueStyle={{ fontSize: 14 }}
              />
            </UICol>

            <UICol span={12}>
              <UIStatistic
                title="Event Loop Lag"
                value={eventLoopLagMs.toFixed(1)}
                suffix="ms"
                valueStyle={{
                  fontSize: 20,
                  color: getMetricColor(eventLoopLagMs, 100, 200),
                }}
              />
            </UICol>

            <UICol span={12}>
              <UIStatistic
                title="Active Operations"
                value={activeOperations}
                valueStyle={{ fontSize: 20 }}
              />
            </UICol>
          </UIRow>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Top Operations</div>
            {topOperations.length > 0 ? (
              topOperations.map((operation) => (
                <div
                  key={operation.operation}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: '1px solid var(--border-secondary)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{operation.operation.replace(/^http\./, '')}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {operation.count ?? 0} req · {(operation.avgDurationMs ?? 0).toFixed(1)}ms avg
                  </span>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No operation samples available</div>
            )}
          </div>
        </>
      )}
    </UICard>
  );
}
