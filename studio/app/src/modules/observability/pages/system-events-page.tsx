import {
  UICard,
  UIAlert,
  UIBadge,
  UITag,
  UITimeline,
  UIRow,
  UICol,
  UIStatistic,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useSystemEvents } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { RegistryEvent, HealthEvent } from '@kb-labs/studio-data-client';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

/**
 * Format timestamp to time string
 */
function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * System Events Live Feed Page
 *
 * Shows real-time system events from /events/registry SSE stream:
 * - Registry updates (plugin registration, checksums)
 * - Health status changes
 * - Redis state transitions
 * - Plugin mount events
 */
export function SystemEventsPage() {
  const sources = useDataSources();
  const { events, isConnected, error } = useSystemEvents(sources.observability);

  const latestHealth = events.find((e) => e.type === 'health') as HealthEvent | undefined;
  const latestRegistry = events.find((e) => e.type === 'registry') as RegistryEvent | undefined;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="System Events"
        description="Real-time system event stream - Auto-updates via Server-Sent Events"
      />

      {/* Connection Status */}
      {!isConnected && !error && (
        <UIAlert
          message="Connecting to event stream..."
          variant="info"
          showIcon
          icon={<UIIcon name="SyncOutlined" spin />}
          style={{ marginBottom: 24 }}
        />
      )}

      {error && (
        <UIAlert
          message="Connection failed"
          description={error.message + ' - Make sure REST API is running on localhost:5050'}
          variant="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {isConnected && (
        <UIAlert
          message="Connected to event stream"
          variant="success"
          showIcon
          icon={<UIIcon name="CheckCircleOutlined" />}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Current System Status */}
      <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <UICol xs={24} lg={12}>
          <UICard
            title="Latest Health Status"
            extra={
              latestHealth ? (
                <UIBadge
                  variant={latestHealth.ready ? 'success' : 'error'}
                >
                  {latestHealth.ready ? 'Ready' : 'Not Ready'}
                </UIBadge>
              ) : null
            }
          >
            {latestHealth ? (
              <UIRow gutter={16}>
                <UICol span={8}>
                  <UIStatistic
                    title="Status"
                    value={latestHealth.status}
                    valueStyle={{ color: latestHealth.status === 'healthy' ? '#52c41a' : '#ff4d4f' }}
                  />
                </UICol>
                <UICol span={8}>
                  <UIStatistic
                    title="Plugins Mounted"
                    value={latestHealth.pluginsMounted ?? 0}
                    suffix={latestHealth.pluginsMounted !== undefined && latestHealth.pluginsFailed !== undefined
                      ? `/ ${latestHealth.pluginsMounted + latestHealth.pluginsFailed}`
                      : ''}
                  />
                </UICol>
                <UICol span={8}>
                  <UIStatistic
                    title="Redis"
                    value={latestHealth.redisEnabled
                      ? (latestHealth.redisHealthy ? 'Healthy' : 'Unhealthy')
                      : 'Disabled'}
                    valueStyle={{
                      color: !latestHealth.redisEnabled
                        ? '#8c8c8c'
                        : (latestHealth.redisHealthy ? '#52c41a' : '#ff4d4f')
                    }}
                  />
                </UICol>
              </UIRow>
            ) : (
              <UIAlert message="No health data received yet" variant="info" showIcon />
            )}
          </UICard>
        </UICol>

        <UICol xs={24} lg={12}>
          <UICard
            title="Latest Registry"
            extra={
              latestRegistry ? (
                <UITag color={latestRegistry.stale ? 'orange' : 'green'}>
                  {latestRegistry.stale ? 'Stale' : 'Fresh'}
                </UITag>
              ) : null
            }
          >
            {latestRegistry ? (
              <UIRow gutter={16}>
                <UICol span={12}>
                  <UIStatistic
                    title="Revision"
                    value={String(latestRegistry.rev).substring(0, 8)}
                    valueStyle={{ fontSize: 18 }}
                  />
                </UICol>
                <UICol span={12}>
                  <UIStatistic
                    title="Generated"
                    value={formatTime(latestRegistry.generatedAt)}
                    valueStyle={{ fontSize: 18 }}
                  />
                </UICol>
              </UIRow>
            ) : (
              <UIAlert message="No registry data received yet" variant="info" showIcon />
            )}
          </UICard>
        </UICol>
      </UIRow>

      {/* Event Timeline */}
      <UICard
        title="Live Event Feed"
        extra={
          <UIBadge
            count={events.length}
            overflowCount={99}
            style={{ backgroundColor: '#1890ff' }}
          />
        }
      >
        {events.length > 0 ? (
          <UITimeline
            items={events.map((event, index) => {
              if (event.type === 'health') {
                const healthEvent = event as HealthEvent;
                return {
                  key: index,
                  color: healthEvent.ready ? 'green' : 'red',
                  dot: healthEvent.ready ? <UIIcon name="CheckCircleOutlined" /> : <UIIcon name="CloseCircleOutlined" />,
                  children: (
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        <UITag color="blue">HEALTH</UITag>
                        <UITag color={healthEvent.status === 'healthy' ? 'green' : 'red'}>
                          {healthEvent.status}
                        </UITag>
                        {healthEvent.ready && <UITag color="green">READY</UITag>}
                        {!healthEvent.ready && healthEvent.reason && (
                          <UITag color="orange">{healthEvent.reason}</UITag>
                        )}
                        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
                          {formatTime(healthEvent.ts)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        {healthEvent.pluginsMounted !== undefined && healthEvent.pluginsFailed !== undefined ? (
                          <>Plugins: {healthEvent.pluginsMounted} mounted, {healthEvent.pluginsFailed} failed</>
                        ) : (
                          <>Plugins: status unavailable</>
                        )}
                        {healthEvent.redisEnabled && (
                          <> | Redis: {healthEvent.redisHealthy ? 'healthy' : 'unhealthy'}</>
                        )}
                      </div>
                    </div>
                  ),
                };
              } else {
                const registryEvent = event as RegistryEvent;
                return {
                  key: index,
                  color: registryEvent.stale ? 'orange' : 'blue',
                  dot: <UIIcon name="ApiOutlined" />,
                  children: (
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        <UITag color="purple">REGISTRY</UITag>
                        <UITag>{String(registryEvent.rev).substring(0, 8)}</UITag>
                        {registryEvent.stale && <UITag color="orange">STALE</UITag>}
                        {registryEvent.partial && <UITag color="orange">PARTIAL</UITag>}
                        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
                          {formatTime(registryEvent.generatedAt)}
                        </span>
                      </div>
                      {registryEvent.checksum && (
                        <div style={{ fontSize: 13 }}>
                          Checksum: {registryEvent.checksum.substring(0, 16)}...
                          {registryEvent.previousChecksum && ' (changed)'}
                        </div>
                      )}
                    </div>
                  ),
                };
              }
            })}
          />
        ) : (
          <UIAlert
            message="No events received yet"
            description="Waiting for system events..."
            variant="info"
            showIcon
            icon={<UIIcon name="SyncOutlined" spin />}
          />
        )}
      </UICard>
    </UIPage>
  );
}
