import React, { useState, useEffect } from 'react';
import { UICard } from '@kb-labs/studio-ui-kit';
import { useDataSources } from '../../../providers/data-sources-provider';
import { usePrometheusMetrics } from '@kb-labs/studio-data-client';
import './PlatformPulse.css';

interface HistoryPoint {
  timestamp: number;
  requests: number;
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) {return '0m';}
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {return `${days}d ${hours}h`;}
  if (hours > 0) {return `${hours}h ${minutes}m`;}
  return `${minutes}m`;
}

export function PlatformPulse() {
  const sources = useDataSources();
  const metrics = usePrometheusMetrics(sources.observability);

  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (!metrics.data) {return;}
    setHistory(prev => [...prev, {
      timestamp: Date.now(),
      requests: metrics.data.requests?.total ?? 0,
    }].slice(-10));
  }, [metrics.data]);

  const totalRequests = metrics.data?.requests?.total ?? 0;
  const successRequests = metrics.data?.requests?.success ?? 0;
  const uptime = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 100;
  const runtimeSeconds = metrics.data?.uptime?.seconds ?? 0;

  const status = uptime >= 99 ? 'healthy' : uptime >= 95 ? 'degraded' : 'critical';
  const statusLabel = status === 'healthy' ? 'Platform healthy' : status === 'degraded' ? 'Platform degraded' : 'Platform critical';

  // Trend vs the oldest sample we're still holding
  const trendDelta = history.length > 1
    ? totalRequests - (history[0]?.requests ?? totalRequests)
    : 0;

  return (
    <UICard styles={{ body: { padding: '18px 24px' } }}>
      <div className="platform-pulse">
        <div className="platform-pulse__status">
          <span className={`platform-pulse__dot platform-pulse__dot--${status}`} />
          <span className="platform-pulse__status-label">{statusLabel}</span>
        </div>

        <span className="platform-pulse__divider" />

        <div className="platform-pulse__metric">
          <span className="platform-pulse__value">{uptime.toFixed(2)}%</span>
          <span className="platform-pulse__label">uptime</span>
        </div>

        <div className="platform-pulse__metric">
          <span className="platform-pulse__value">{totalRequests.toLocaleString()}</span>
          <span className="platform-pulse__label">requests</span>
          {trendDelta > 0 && (
            <span className="platform-pulse__trend">+{trendDelta.toLocaleString()}</span>
          )}
        </div>

        <div className="platform-pulse__metric">
          <span className="platform-pulse__value">{formatUptime(runtimeSeconds)}</span>
          <span className="platform-pulse__label">runtime</span>
        </div>

        <div className="platform-pulse__live">
          <span className="platform-pulse__pulse-dot" />
          LIVE
        </div>
      </div>
    </UICard>
  );
}
