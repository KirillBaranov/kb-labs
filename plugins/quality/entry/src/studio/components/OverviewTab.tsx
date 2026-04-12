/**
 * Overview tab - shows health score, stats, and key metrics
 */

import * as React from 'react';
import { useData, UIRow, UICol, UICard, UIStatistic, UIProgress, UITag, UIAlert, UISpin, UIButton, UISpace, UIIcon } from '@kb-labs/sdk/studio';
import type { StatsResponse, HealthResponse, StaleResponse } from '@kb-labs/quality-contracts';

export function OverviewTab() {
  const { data: statsData, isLoading: statsLoading } = useData<StatsResponse>(
    '/v1/plugins/quality/stats?includeHealth=true',
  );
  const { data: healthData, isLoading: healthLoading } = useData<HealthResponse>(
    '/v1/plugins/quality/health?detailed=true',
  );
  const { data: staleData, isLoading: staleLoading } = useData<StaleResponse>(
    '/v1/plugins/quality/stale?detailed=true',
  );

  const isLoading = statsLoading || healthLoading;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <UISpin size="large" />
      </div>
    );
  }

  const getGradeColor = (grade?: string): string => {
    switch (grade) {
      case 'A': return 'green';
      case 'B': return 'blue';
      case 'C': return 'orange';
      case 'D': return 'red';
      case 'F': return 'volcano';
      default: return 'default';
    }
  };

  const getHealthStatus = (score?: number): 'success' | 'exception' | 'normal' => {
    if (!score) {return 'normal';}
    if (score >= 80) {return 'success';}
    if (score < 60) {return 'exception';}
    return 'normal';
  };

  const getSeverityVariant = (severity: number): 'error' | 'warning' | 'info' => {
    if (severity >= 3) {return 'error';}
    if (severity >= 2) {return 'warning';}
    return 'info';
  };

  return (
    <div>
      {/* Stale Packages Alert */}
      {!staleLoading && staleData && staleData.totalStale > 0 && (
        <UIAlert
          variant="error"
          showIcon
          icon={<UIIcon name="ClockCircleOutlined" />}
          message={`${staleData.totalStale} stale package${staleData.totalStale > 1 ? 's' : ''} detected`}
          description={
            <div>
              <p style={{ marginBottom: 8 }}>
                Some packages need rebuilding. This affects {staleData.totalAffected} downstream
                package{staleData.totalAffected > 1 ? 's' : ''}.
              </p>
              {staleData.criticalChains && staleData.criticalChains.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Critical chains:</strong>
                  <ul style={{ marginTop: 4, marginBottom: 0 }}>
                    {staleData.criticalChains.slice(0, 3).map((chain, idx) => (
                      <li key={idx}>
                        <code>{chain.root}</code> affects {chain.affected.length} packages
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <UISpace>
                <UIButton variant="primary" danger icon={<UIIcon name="ThunderboltOutlined" />} size="small">
                  Rebuild All Stale
                </UIButton>
                <UIButton size="small">View Details</UIButton>
              </UISpace>
            </div>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Health Score Card */}
      <UICard title="Health Score" style={{ marginBottom: 24 }}>
        <UIRow gutter={24}>
          <UICol span={12}>
            <div style={{ textAlign: 'center' }}>
              <UIProgress
                type="circle"
                percent={healthData?.score ?? 0}
                size={180}
                status={getHealthStatus(healthData?.score)}
                strokeColor={{
                  '0%': healthData?.score && healthData.score >= 80 ? '#52c41a' : '#ff4d4f',
                  '100%': healthData?.score && healthData.score >= 80 ? '#73d13d' : '#ff7a45',
                }}
              />
              <div style={{ marginTop: 16 }}>
                <UITag color={getGradeColor(healthData?.grade)} style={{ fontSize: 16 }}>
                  Grade {healthData?.grade}
                </UITag>
              </div>
            </div>
          </UICol>
          <UICol span={12}>
            <UIStatistic
              title="Packages"
              value={statsData?.packages ?? 0}
              prefix={<UIIcon name="DatabaseOutlined" />}
            />
            <UIStatistic
              title="Lines of Code"
              value={statsData?.loc ?? 0}
              prefix={<UIIcon name="CodeOutlined" />}
              style={{ marginTop: 16 }}
            />
            <UIStatistic
              title="Total Size"
              value={statsData?.size ?? 'N/A'}
              prefix={<UIIcon name="FileTextOutlined" />}
              style={{ marginTop: 16 }}
            />
          </UICol>
        </UIRow>
      </UICard>

      {/* Issues Breakdown */}
      {healthData?.issues && healthData.issues.length > 0 && (
        <UICard title="Health Issues" style={{ marginBottom: 24 }}>
          <UIRow gutter={16}>
            {healthData.issues.map((issue, idx) => (
              <UICol span={24} key={idx} style={{ marginBottom: 12 }}>
                <UIAlert
                  message={
                    <UISpace>
                      <span>{issue.description}</span>
                      <UITag color={getSeverityVariant(issue.severity) === 'error' ? 'red' : 'orange'}>
                        severity: {issue.severity}
                      </UITag>
                      {issue.count !== undefined && <UITag>{issue.count} affected</UITag>}
                    </UISpace>
                  }
                  variant={getSeverityVariant(issue.severity)}
                  showIcon
                  icon={
                    getSeverityVariant(issue.severity) === 'error' ? (
                      <UIIcon name="WarningOutlined" />
                    ) : (
                      <UIIcon name="CheckCircleOutlined" />
                    )
                  }
                />
              </UICol>
            ))}
          </UIRow>
        </UICard>
      )}

      {/* Quick Stats */}
      <UIRow gutter={16}>
        <UICol span={8}>
          <UICard>
            <UIStatistic
              title="Packages"
              value={statsData?.packages ?? 0}
              prefix={<UIIcon name="DatabaseOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol span={8}>
          <UICard>
            <UIStatistic
              title="Lines of Code"
              value={statsData?.loc ?? 0}
              prefix={<UIIcon name="CodeOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol span={8}>
          <UICard>
            <UIStatistic
              title="Total Size"
              value={statsData?.size ?? 'N/A'}
              prefix={<UIIcon name="FileTextOutlined" />}
            />
          </UICard>
        </UICol>
      </UIRow>
    </div>
  );
}
