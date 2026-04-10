import {
  UIRow,
  UICol,
  UITable,
  UICard,
  UIStatistic,
  UITag,
  UIAlert,
  UIProgress,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useDevKitHealth } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

/**
 * Get color for health grade
 */
function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'success';
    case 'B':
      return 'processing';
    case 'C':
      return 'warning';
    case 'D':
    case 'F':
      return 'error';
    default:
      return 'default';
  }
}

/**
 * Get icon for health grade
 */
function getGradeIcon(grade: string) {
  switch (grade) {
    case 'A':
      return <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />;
    case 'B':
      return <UIIcon name="CheckCircleOutlined" style={{ color: '#1890ff' }} />;
    case 'C':
      return <UIIcon name="WarningOutlined" style={{ color: '#faad14' }} />;
    case 'D':
      return <UIIcon name="ExclamationCircleOutlined" style={{ color: '#ff7a45' }} />;
    case 'F':
      return <UIIcon name="CloseCircleOutlined" style={{ color: '#ff4d4f' }} />;
    default:
      return <UIIcon name="ExclamationCircleOutlined" />;
  }
}

/**
 * Get status for health score progress bar
 */
function getScoreStatus(score: number): 'success' | 'normal' | 'exception' {
  if (score >= 80) {return 'success';}
  if (score >= 60) {return 'normal';}
  return 'exception';
}

/**
 * Format issue key to human-readable label
 */
function formatIssueLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * DevKit Health Observability Page
 *
 * Shows monorepo health metrics from DevKit:
 * - Health score and grade
 * - Issues breakdown (duplicate deps, type errors, etc.)
 * - Package count and type coverage
 */
export function DevKitPage() {
  const sources = useDataSources();
  const { data, isLoading, error, isError } = useDevKitHealth(sources.observability);

  if (isError) {
    return (
      <UIPage>
        <UIPageHeader
          title="DevKit Health"
          description="Monorepo health and quality metrics"
        />
        <UIAlert
          message="Failed to load DevKit health"
          description={error instanceof Error ? error.message : 'Unknown error. Make sure DevKit is installed and executable.'}
          variant="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      </UIPage>
    );
  }

  if (isLoading || !data) {
    return (
      <UIPage>
        <UIPageHeader
          title="DevKit Health"
          description="Monorepo health and quality metrics"
        />
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          Loading DevKit health check... (this may take up to 30 seconds)
        </div>
      </UIPage>
    );
  }

  const totalIssues = Object.values(data.issues).reduce((sum: number, count) => sum + (count ?? 0), 0);

  return (
    <UIPage width="full">
      <UIPageHeader
        title="DevKit Health"
        description="Monorepo health and quality metrics - Cached for 1 minute"
      />

      {/* Overview Stats */}
      <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <UICol xs={24} sm={12} lg={8}>
          <UICard>
            <UIStatistic
              title="Health Score"
              value={data.healthScore}
              suffix="/ 100"
              prefix={getGradeIcon(data.grade)}
              valueStyle={{
                color: data.healthScore >= 80 ? '#52c41a' :
                       data.healthScore >= 60 ? '#1890ff' :
                       '#ff4d4f'
              }}
            />
            <div style={{ marginTop: 8 }}>
              <UITag color={getGradeColor(data.grade)} style={{ fontSize: 14 }}>
                Grade {data.grade}
              </UITag>
            </div>
          </UICard>
        </UICol>
        <UICol xs={24} sm={12} lg={8}>
          <UICard>
            <UIStatistic
              title="Total Packages"
              value={data.packages}
              prefix={<UIIcon name="CodeOutlined" />}
            />
          </UICard>
        </UICol>
        <UICol xs={24} sm={12} lg={8}>
          <UICard>
            <UIStatistic
              title="Total Issues"
              value={totalIssues}
              prefix={<UIIcon name="WarningOutlined" />}
              valueStyle={{ color: totalIssues > 100 ? '#ff4d4f' : '#faad14' }}
            />
          </UICard>
        </UICol>
      </UIRow>

      {/* Health Score Progress */}
      <UICard title="Health Score Breakdown" style={{ marginBottom: 24 }}>
        <UIProgress
          percent={data.healthScore}
          status={getScoreStatus(data.healthScore)}
          strokeColor={
            data.healthScore >= 80 ? '#52c41a' :
            data.healthScore >= 60 ? '#1890ff' :
            '#ff4d4f'
          }
        />
        <div style={{ marginTop: 16, fontSize: 12, color: '#8c8c8c' }}>
          {data.healthScore >= 90 ? 'Excellent monorepo health!' :
           data.healthScore >= 80 ? 'Good health - minor improvements needed' :
           data.healthScore >= 70 ? 'Moderate health - some issues to address' :
           data.healthScore >= 60 ? 'Fair health - significant issues present' :
           'Poor health - urgent attention required'}
        </div>
      </UICard>

      {/* Type Coverage (if available) */}
      {data.avgTypeCoverage !== undefined && (
        <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <UICol span={24}>
            <UICard title="TypeScript Type Coverage">
              <UIProgress
                percent={Math.round(data.avgTypeCoverage)}
                status={data.avgTypeCoverage >= 90 ? 'success' : data.avgTypeCoverage >= 70 ? 'normal' : 'exception'}
                strokeColor={data.avgTypeCoverage >= 90 ? '#52c41a' : data.avgTypeCoverage >= 70 ? '#1890ff' : '#faad14'}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                Average type coverage across all packages
              </div>
            </UICard>
          </UICol>
        </UIRow>
      )}

      {/* Issues Breakdown Table */}
      <UICard title="Issues Breakdown">
        <UITable
          dataSource={Object.entries(data.issues)
            .map(([key, count]) => ({
              key,
              issue: formatIssueLabel(key),
              count: count ?? 0,
              severity: (count ?? 0) > 100 ? 'high' : (count ?? 0) > 10 ? 'medium' : 'low',
            }))
            .sort((a, b) => b.count - a.count)} // Sort by count descending
          columns={[
            {
              title: 'Issue Type',
              dataIndex: 'issue',
              key: 'issue',
              render: (issue: string) => <strong>{issue}</strong>,
            },
            {
              title: 'Count',
              dataIndex: 'count',
              key: 'count',
              align: 'right' as const,
              render: (count: number) => (
                <span style={{
                  color: count > 100 ? '#ff4d4f' :
                         count > 10 ? '#faad14' :
                         '#52c41a'
                }}>
                  {count.toLocaleString()}
                </span>
              ),
            },
            {
              title: 'Severity',
              dataIndex: 'severity',
              key: 'severity',
              align: 'center' as const,
              render: (severity: string) => {
                const config = {
                  high: { color: 'error', label: 'High' },
                  medium: { color: 'warning', label: 'Medium' },
                  low: { color: 'success', label: 'Low' },
                }[severity] || { color: 'default', label: 'Unknown' };

                return <UITag color={config.color}>{config.label}</UITag>;
              },
            },
          ]}
          pagination={false}
          size="small"
        />
      </UICard>
    </UIPage>
  );
}
