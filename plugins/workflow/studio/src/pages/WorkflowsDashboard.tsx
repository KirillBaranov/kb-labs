/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflows-dashboard-page
 * Main Workflow Dashboard - Activity-first view with active runs, stats, and recent history
 */

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UIRow,
  UICol,
  UISpace,
  UITypographyText,
  UIIcon,
  UICard,
  UITable,
  UITag,
  UIButton,
} from '@kb-labs/sdk/studio';
import { useData, useMutateData } from '@kb-labs/sdk/studio';
import type { DashboardStatsResponse, WorkflowInfo } from '@kb-labs/workflow-contracts';
import { ActiveRunsPanel } from '../components/ActiveRunsPanel';
import { RunWorkflowModal } from '../components/RunWorkflowModal';
import { UIPage, UIPageHeader } from '@kb-labs/sdk/studio';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <UIIcon name="CheckCircleOutlined" className="text-success" />,
  failed: <UIIcon name="CloseCircleOutlined" className="text-error" />,
  cancelled: <UIIcon name="StopOutlined" className="text-warning" />,
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {return 'Just now';}
  if (diffMins < 60) {return `${diffMins}m ago`;}
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {return `${diffHours}h ago`;}
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDuration(ms?: number) {
  if (!ms) {return '-';}
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {return `${seconds}s`;}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ${seconds % 60}s`;}
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function WorkflowsDashboard() {
  const navigate = useNavigate();
  const [runModalOpen, setRunModalOpen] = React.useState(false);

  const { data: stats } = useData<DashboardStatsResponse>('/v1/stats', { pollingMs: 3000 });
  const { data: workflowsData } = useData<{ workflows: WorkflowInfo[] }>('/v1/workflows', { params: { limit: 100 } });

  const runWorkflowMutation = useMutateData<
    { workflowId: string; input: Record<string, unknown> },
    { runId: string; status: string }
  >('/v1/workflows/run');

  const recentActivity = stats?.recentActivity || [];

  const recentColumns = [
    {
      title: 'Time',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      width: 100,
      render: (date: string) => (
        <UITypographyText className="typo-caption" style={{ whiteSpace: 'nowrap' }}>
          {formatRelativeDate(date)}
        </UITypographyText>
      ),
    },
    {
      title: 'Workflow / Job',
      dataIndex: 'workflowName',
      key: 'workflowName',
      width: 280,
      render: (name: string | undefined, record: typeof recentActivity[0]) => (
        <div style={{ overflow: 'hidden' }}>
          <UITypographyText
            className="typo-body"
            ellipsis={{ tooltip: name || record.type }}
            style={{ display: 'block' }}
          >
            {name || record.type}
          </UITypographyText>
          <UITypographyText
            className="typo-caption text-tertiary"
            code
            ellipsis={{ tooltip: record.id }}
            style={{ display: 'block' }}
          >
            {record.id.slice(0, 16)}...
          </UITypographyText>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: 'completed' | 'failed' | 'cancelled') => (
        <UITag icon={STATUS_ICONS[status]} color={STATUS_COLORS[status]}>
          {status.toUpperCase()}
        </UITag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 100,
      render: (ms?: number) => (
        <UITypographyText className="typo-caption">{formatDuration(ms)}</UITypographyText>
      ),
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      render: (error?: string) =>
        error ? (
          <UITypographyText
            className="typo-caption text-error"
            ellipsis={{ tooltip: error }}
            style={{ display: 'block' }}
          >
            {error}
          </UITypographyText>
        ) : (
          <UITypographyText className="typo-caption text-tertiary">-</UITypographyText>
        ),
    },
  ];

  const handleOpenRunModal = () => {
    setRunModalOpen(true);
  };

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Workflows"
        description="Monitor workflows, jobs, and scheduled tasks"
        icon={<UIIcon name="ThunderboltOutlined" />}
        breadcrumbs={[{ title: 'Home', href: '/' }, { title: 'Workflows' }]}
        actions={
          <UIButton
            variant="primary"
            icon={<UIIcon name="PlayCircleOutlined" />}
            onClick={handleOpenRunModal}
          >
            Run Workflow
          </UIButton>
        }
      />

      {/* Active Runs - always visible */}
      <ActiveRunsPanel />

      {/* Stats Row */}
      <UICard style={{ marginBottom: 'var(--spacing-section)' }}>
        <UIRow gutter={16}>
          <UICol span={6}>
            <UISpace direction="vertical" className="gap-tight">
              <UITypographyText className="typo-label text-secondary">Total Workflows</UITypographyText>
              <UITypographyText className="typo-section-title">{stats?.workflows.total || 0}</UITypographyText>
              <UISpace className="gap-tight">
                <UITypographyText className="typo-caption text-success">
                  {stats?.workflows.active || 0} active
                </UITypographyText>
                <UITypographyText className="typo-caption text-secondary">
                  {stats?.workflows.inactive || 0} inactive
                </UITypographyText>
              </UISpace>
            </UISpace>
          </UICol>
          <UICol span={6}>
            <UISpace direction="vertical" className="gap-tight">
              <UITypographyText className="typo-label text-secondary">Jobs Running</UITypographyText>
              <UITypographyText className="typo-section-title text-info">
                {stats?.jobs.running || 0}
              </UITypographyText>
              <UISpace className="gap-tight">
                <UITypographyText className="typo-caption text-secondary">
                  {stats?.jobs.pending || 0} pending
                </UITypographyText>
              </UISpace>
            </UISpace>
          </UICol>
          <UICol span={6}>
            <UISpace direction="vertical" className="gap-tight">
              <UITypographyText className="typo-label text-secondary">Jobs Completed</UITypographyText>
              <UITypographyText className="typo-section-title text-success">
                {stats?.jobs.completed || 0}
              </UITypographyText>
              <UISpace className="gap-tight">
                <UITypographyText className="typo-caption text-error">
                  {stats?.jobs.failed || 0} failed
                </UITypographyText>
              </UISpace>
            </UISpace>
          </UICol>
          <UICol span={6}>
            <UISpace direction="vertical" className="gap-tight">
              <UITypographyText className="typo-label text-secondary">Cron Jobs</UITypographyText>
              <UITypographyText className="typo-section-title">{stats?.crons.total || 0}</UITypographyText>
              <UISpace className="gap-tight">
                <UITypographyText className="typo-caption text-success">
                  {stats?.crons.enabled || 0} enabled
                </UITypographyText>
                <UITypographyText className="typo-caption text-secondary">
                  {stats?.crons.disabled || 0} disabled
                </UITypographyText>
              </UISpace>
            </UISpace>
          </UICol>
        </UIRow>
      </UICard>

      {/* Recent Activity */}
      <UICard
        title={<UITypographyText className="typo-card-title">Recent Activity</UITypographyText>}
        style={{ marginBottom: 'var(--spacing-section)' }}
      >
        <UITable
          dataSource={recentActivity}
          columns={recentColumns}
          rowKey="id"
          scroll={{ x: 760 }}
          pagination={{ pageSize: 20 }}
          onRow={(record: typeof recentActivity[0]) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/workflows/runs/${record.id}`),
          })}
        />
      </UICard>

      <RunWorkflowModal
        open={runModalOpen}
        workflows={workflowsData?.workflows ?? []}
        loading={runWorkflowMutation.isLoading}
        onClose={() => setRunModalOpen(false)}
        onRun={(workflowId, input) => {
          runWorkflowMutation.mutate({ workflowId, input });
        }}
      />
    </UIPage>
  );
}
