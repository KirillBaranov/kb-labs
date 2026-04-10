import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  UICard,
  UIAlert,
  UIBadge,
  UITag,
  UIRow,
  UICol,
  UIStatistic,
  UITable,
  UISelect,
  UIButton,
  UISpace,
  UITooltip,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import type {
  Incident,
  IncidentQuery,
  IncidentSeverity,
  IncidentType,
  IncidentsListResponse,
} from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

dayjs.extend(relativeTime);

/**
 * Format timestamp to human-readable string
 */
function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Format duration between timestamps
 */
function formatDuration(from: number, to: number): string {
  const durationMs = to - from;
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {return `${days}d ${hours % 24}h`;}
  if (hours > 0) {return `${hours}h ${minutes % 60}m`;}
  return `${minutes}m`;
}

/**
 * Get severity icon and color
 */
function getSeverityConfig(severity: IncidentSeverity): { icon: React.ReactElement; color: string } {
  switch (severity) {
    case 'critical':
      return { icon: <UIIcon name="FireOutlined" />, color: '#ff4d4f' };
    case 'warning':
      return { icon: <UIIcon name="WarningOutlined" />, color: '#faad14' };
    case 'info':
      return { icon: <UIIcon name="InfoCircleOutlined" />, color: '#1890ff' };
  }
}

/**
 * Get incident type label
 */
function getTypeLabel(type: IncidentType): string {
  switch (type) {
    case 'error_rate':
      return 'Error Rate';
    case 'latency_spike':
      return 'Latency Spike';
    case 'plugin_failure':
      return 'Plugin Failure';
    case 'adapter_failure':
      return 'Adapter Failure';
    case 'system_health':
      return 'System Health';
    case 'custom':
      return 'Custom';
  }
}

/**
 * Incidents Management Page
 *
 * Shows all incidents with filters and summary statistics
 */
export function IncidentsPage() {
  const navigate = useNavigate();
  const sources = useDataSources();
  const [filters, setFilters] = useState<IncidentQuery>({
    limit: 50,
    includeResolved: false,
  });

  // Fetch incidents list
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<IncidentsListResponse>({
    queryKey: ['incidents', 'list', filters],
    queryFn: async () => {
      return sources.observability.listIncidents(filters);
    },
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  const incidents = data?.data?.incidents ?? [];
  const summary = data?.data?.summary;

  // Handle filter changes
  const handleSeverityChange = (value: string | number | (string | number)[]) => {
    setFilters({ ...filters, severity: (value as IncidentSeverity) || undefined });
  };

  const handleTypeChange = (value: string | number | (string | number)[]) => {
    setFilters({ ...filters, type: (value as IncidentType) || undefined });
  };

  const handleIncludeResolvedChange = (value: string | number | (string | number)[]) => {
    setFilters({ ...filters, includeResolved: value === 'true' });
  };

  const handleViewIncident = (id: string) => {
    navigate(`/observability/incidents/${id}`);
  };

  // Table columns
  const columns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: IncidentSeverity) => {
        const config = getSeverityConfig(severity);
        return (
          <UITooltip title={severity.toUpperCase()}>
            <UITag color={config.color} icon={config.icon}>
              {severity.toUpperCase()}
            </UITag>
          </UITooltip>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type: IncidentType) => (
        <UITag>{getTypeLabel(type)}</UITag>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: number) => (
        <UITooltip title={formatTime(timestamp)}>
          <span>{dayjs(timestamp).fromNow()}</span>
        </UITooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'resolvedAt',
      key: 'resolvedAt',
      width: 120,
      render: (resolvedAt: number | undefined, record: Incident) => {
        if (resolvedAt) {
          const duration = formatDuration(record.timestamp, resolvedAt);
          return (
            <UITooltip title={`Resolved in ${duration}`}>
              <UITag color="success" icon={<UIIcon name="CheckCircleOutlined" />}>
                RESOLVED
              </UITag>
            </UITooltip>
          );
        }
        return (
          <UITooltip title="Incident is still active">
            <UITag color="error" icon={<UIIcon name="ClockCircleOutlined" />}>
              ACTIVE
            </UITag>
          </UITooltip>
        );
      },
    },
    {
      title: 'AI Analysis',
      dataIndex: 'aiAnalysis',
      key: 'aiAnalysis',
      width: 100,
      align: 'center' as const,
      render: (aiAnalysis: any) => {
        if (aiAnalysis) {
          return <UIBadge variant="success">Yes</UIBadge>;
        }
        return <UIBadge variant="default">No</UIBadge>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: Incident) => (
        <UIButton
          variant="link"
          icon={<UIIcon name="EyeOutlined" />}
          onClick={() => handleViewIncident(record.id)}
        >
          View
        </UIButton>
      ),
    },
  ];

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Incidents"
        description="System incident history with AI-powered analysis"
        actions={[
          <UIButton
            key="refresh"
            icon={<UIIcon name="ReloadOutlined" />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            Refresh
          </UIButton>,
        ]}
      />

      {error && (
        <UIAlert
          message="Failed to load incidents"
          description={(error as Error).message}
          variant="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Summary Statistics */}
      {summary && (
        <UIRow gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <UICol xs={24} sm={6}>
            <UICard>
              <UIStatistic
                title="Total Incidents"
                value={summary.total}
                valueStyle={{ color: '#1890ff' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={6}>
            <UICard>
              <UIStatistic
                title="Unresolved"
                value={summary.unresolved}
                valueStyle={{ color: summary.unresolved > 0 ? '#ff4d4f' : '#52c41a' }}
                suffix={summary.unresolved > 0 ? <UIIcon name="FireOutlined" /> : <UIIcon name="CheckCircleOutlined" />}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={4}>
            <UICard>
              <UIStatistic
                title="Critical"
                value={summary.bySeverity.critical}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={4}>
            <UICard>
              <UIStatistic
                title="Warning"
                value={summary.bySeverity.warning}
                valueStyle={{ color: '#faad14' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={4}>
            <UICard>
              <UIStatistic
                title="Info"
                value={summary.bySeverity.info}
                valueStyle={{ color: '#1890ff' }}
              />
            </UICard>
          </UICol>
        </UIRow>
      )}

      {/* Filters */}
      <UICard style={{ marginBottom: 24 }}>
        <UISpace size="middle" wrap>
          <span>Filters:</span>
          <UISelect
            style={{ width: 140 }}
            placeholder="Severity"
            allowClear
            value={filters.severity}
            onChange={handleSeverityChange}
            options={[
              { label: 'Critical', value: 'critical' },
              { label: 'Warning', value: 'warning' },
              { label: 'Info', value: 'info' },
            ]}
          />
          <UISelect
            style={{ width: 160 }}
            placeholder="Type"
            allowClear
            value={filters.type}
            onChange={handleTypeChange}
            options={[
              { label: 'Error Rate', value: 'error_rate' },
              { label: 'Latency Spike', value: 'latency_spike' },
              { label: 'Plugin Failure', value: 'plugin_failure' },
              { label: 'Adapter Failure', value: 'adapter_failure' },
              { label: 'System Health', value: 'system_health' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
          <UISelect
            style={{ width: 180 }}
            value={filters.includeResolved ? 'true' : 'false'}
            onChange={handleIncludeResolvedChange}
            options={[
              { label: 'Active Only', value: 'false' },
              { label: 'Include Resolved', value: 'true' },
            ]}
          />
        </UISpace>
      </UICard>

      {/* Incidents Table */}
      <UICard>
        <UITable
          dataSource={incidents}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
          }}
        />
      </UICard>
    </UIPage>
  );
}
