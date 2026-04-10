import React, { useState, useEffect } from 'react';
import { UIRow, UICol } from '@kb-labs/studio-ui-kit';
import { useNavigate } from 'react-router-dom';
import {
  RiseOutlined,
  ApiOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { HeroMetricCard } from './HeroMetricCard';
import { useDataSources } from '../../../providers/data-sources-provider';
import {
  usePrometheusMetrics,
  useStateBrokerStats,
} from '@kb-labs/studio-data-client';

interface MetricsHistoryPoint {
  timestamp: number;
  requests: number;
  uptime: number;
}

export function HeroMetricsWidget() {
  const sources = useDataSources();
  const _navigate = useNavigate();

  // Data hooks with auto-refresh
  const metrics = usePrometheusMetrics(sources.observability);
  const stateBroker = useStateBrokerStats(sources.observability);

  // Historical data for sparklines (last 20 data points)
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistoryPoint[]>([]);

  // Collect metrics history
  useEffect(() => {
    if (metrics.data) {
      const newPoint: MetricsHistoryPoint = {
        timestamp: Date.now(),
        requests: metrics.data.requests?.total ?? 0,
        uptime: calculateUptime(metrics.data),
      };

      setMetricsHistory(prev => {
        // Keep last 20 points
        return [...prev, newPoint].slice(-20);
      });
    }
  }, [metrics.data]);

  // Calculate uptime percentage
  const calculateUptime = (metricsData: any) => {
    if (!metricsData?.requests) {return 100;}
    const total = metricsData.requests.total ?? 0;
    const success = metricsData.requests.success ?? 0;
    return total > 0 ? (success / total) * 100 : 100;
  };

  // Calculate trend from history
  const calculateTrend = (data: number[]) => {
    if (data.length < 2) {return null;}
    const recent = data.slice(-5); // Last 5 points
    const older = data.slice(-10, -5); // Previous 5 points
    if (older.length === 0 || recent.length === 0) {return null;}

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    if (olderAvg === 0) {return null;}

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    return {
      direction: change >= 0 ? 'up' as const : 'down' as const,
      value: Math.abs(change),
      isPositive: change >= 0,
    };
  };

  // Format uptime seconds to human-readable
  const formatUptime = (seconds: number | undefined) => {
    if (!seconds) {return '0s';}

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {return `${days}d ${hours}h`;}
    if (hours > 0) {return `${hours}h ${minutes}m`;}
    return `${minutes}m`;
  };

  // Extract sparkline data
  const requestsSparkline = metricsHistory.map(p => p.requests);
  const uptimeSparkline = metricsHistory.map(p => p.uptime);

  // Calculate trends
  const requestsTrend = calculateTrend(requestsSparkline);

  // Metric values
  const currentUptime = calculateUptime(metrics.data);
  const totalRequests = metrics.data?.requests?.total ?? 0;
  const runtimeSeconds = metrics.data?.uptime?.seconds ?? 0;

  // Determine uptime status
  const getUptimeStatus = () => {
    if (currentUptime >= 99) {return 'healthy';}
    if (currentUptime >= 95) {return 'warning';}
    return 'critical';
  };

  return (
    <UIRow gutter={[16, 16]}>
      <UICol xs={24} sm={12} lg={8}>
        <HeroMetricCard
          title="Uptime"
          value={`${currentUptime.toFixed(2)}%`}
          subtitle={stateBroker.data ? `Cache: ${(stateBroker.data.hitRate * 100).toFixed(1)}%` : 'Success rate'}
          sparklineData={uptimeSparkline}
          status={getUptimeStatus()}
          icon={<RiseOutlined />}
        />
      </UICol>

      <UICol xs={24} sm={12} lg={8}>
        <HeroMetricCard
          title="Total Requests"
          value={totalRequests.toLocaleString()}
          subtitle={metrics.data ? `Success: ${metrics.data.requests.success.toLocaleString()}` : 'Loading...'}
          sparklineData={requestsSparkline}
          trend={requestsTrend ?? undefined}
          status="default"
          icon={<ApiOutlined />}
        />
      </UICol>

      <UICol xs={24} sm={12} lg={8}>
        <HeroMetricCard
          title="Runtime"
          value={formatUptime(runtimeSeconds)}
          subtitle="LIVE"
          status="live"
          pulsing={true}
          icon={<ClockCircleOutlined />}
        />
      </UICol>
    </UIRow>
  );
}
