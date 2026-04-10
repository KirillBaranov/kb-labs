import * as React from 'react';
import { Dropdown, Badge, Divider } from 'antd';
import { Activity, CheckCircle, AlertTriangle, XCircle, Database, Package, Clock } from 'lucide-react';
import { UIButton } from '@kb-labs/studio-ui-kit';

export interface SystemHealthData {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  ready: boolean;
  reason?: string;
  pluginsMounted?: number;
  pluginsFailed?: number;
  registryRev?: number | null;
  registryGeneratedAt?: string | null;
  registryStale?: boolean;
  registryPartial?: boolean;
  redisEnabled?: boolean;
  redisHealthy?: boolean;
}

export interface KBSystemHealthIndicatorProps {
  health?: SystemHealthData;
  loading?: boolean;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  healthy: {
    color: '#52c41a',
    icon: CheckCircle,
    label: 'Healthy',
    badgeStatus: 'success' as const,
  },
  degraded: {
    color: '#faad14',
    icon: AlertTriangle,
    label: 'Degraded',
    badgeStatus: 'warning' as const,
  },
  down: {
    color: '#ff4d4f',
    icon: XCircle,
    label: 'Down',
    badgeStatus: 'error' as const,
  },
  unknown: {
    color: '#8c8c8c',
    icon: Activity,
    label: 'Unknown',
    badgeStatus: 'default' as const,
  },
} as const;

function formatTimeAgo(isoString: string | null | undefined): string {
  if (!isoString) {return 'unknown';}

  const now = Date.now();
  const timestamp = new Date(isoString).getTime();
  const diffMs = now - timestamp;

  if (diffMs < 60_000) {return 'just now';}
  if (diffMs < 3600_000) {return `${Math.floor(diffMs / 60_000)}min ago`;}
  if (diffMs < 86400_000) {return `${Math.floor(diffMs / 3600_000)}h ago`;}
  return `${Math.floor(diffMs / 86400_000)}d ago`;
}

export function KBSystemHealthIndicator({
  health,
  loading = false,
  onClick,
}: KBSystemHealthIndicatorProps) {
  const status = health?.status ?? 'unknown';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  // Build dropdown content
  const dropdownContent = React.useMemo(() => {
    if (!health) {
      return (
        <div style={{
          padding: '12px 16px',
          minWidth: 280,
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            No health data available
          </div>
        </div>
      );
    }

    return (
      <div style={{
        padding: '12px 16px',
        minWidth: 280,
        backgroundColor: 'var(--bg-primary)',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <StatusIcon size={18} color={config.color} />
          <strong style={{ fontSize: 14 }}>System Status: {config.label}</strong>
        </div>
        {!health.ready && health.reason && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, paddingLeft: 26 }}>
            Reason: {health.reason}
          </div>
        )}

        <Divider style={{ margin: '12px 0' }} />

        {/* Plugins */}
        {(health.pluginsMounted !== undefined || health.pluginsFailed !== undefined) && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <Package size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>Plugins: {health.pluginsMounted ?? 0} mounted</div>
                {(health.pluginsFailed ?? 0) > 0 && (
                  <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 2 }}>
                    {health.pluginsFailed} failed
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Registry */}
        {(health.registryRev !== undefined || health.registryGeneratedAt) && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <Database size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  Registry: rev #{health.registryRev ?? 'unknown'}
                  {(() => {
                    const badges: string[] = [];
                    if (health.registryStale) {badges.push('stale');}
                    if (health.registryPartial) {badges.push('partial');}
                    return badges.length > 0 ? ` (${badges.join(', ')})` : '';
                  })()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Updated {formatTimeAgo(health.registryGeneratedAt)}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Redis */}
        {health.redisEnabled !== undefined && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Database size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  Redis: {health.redisEnabled ? 'enabled' : 'disabled'}
                </div>
                {health.redisEnabled && (
                  <div style={{ fontSize: 12, color: health.redisHealthy ? '#52c41a' : '#ff4d4f', marginTop: 2 }}>
                    {health.redisHealthy ? 'healthy ✓' : 'unhealthy ✗'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }, [health, config, StatusIcon]);

  if (loading) {
    return (
      <UIButton
        variant="text"
        size="small"
        icon={<Clock size={16} />}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        Loading...
      </UIButton>
    );
  }

  // Show badge only if there are issues
  const showBadge =
    status === 'degraded' ||
    status === 'down' ||
    (health?.pluginsFailed ?? 0) > 0 ||
    health?.registryStale ||
    health?.registryPartial;

  const buttonElement = (
    <UIButton
      variant="text"
      onClick={onClick}
      icon={<StatusIcon size={18} color={config.color} strokeWidth={2} />}
      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
    >
      System
    </UIButton>
  );

  return (
    <Dropdown
      dropdownRender={() => dropdownContent}
      placement="bottomRight"
      trigger={['click']}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {showBadge ? (
          <Badge
            dot
            status={config.badgeStatus}
            offset={[-2, 2]}
          >
            {buttonElement}
          </Badge>
        ) : (
          buttonElement
        )}
      </span>
    </Dropdown>
  );
}
