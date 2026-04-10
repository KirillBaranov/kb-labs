/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflow-definition-page
 * Workflow definition detail page with recent runs
 */

import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  UISpin,
  UITag,
  UISpace,
  UITypographyText,
  UICard,
  UITable,
  UIButton,
  UIIcon,
  UIDescriptions,
  UIEmptyState,
  useUIMessage,
} from '@kb-labs/sdk/studio';
import { useData, useMutateData } from '@kb-labs/sdk/studio';
import { UIPage, UIPageHeader } from '@kb-labs/sdk/studio';
import type { WorkflowRunInfo, WorkflowInfo } from '@kb-labs/workflow-contracts';
import { RunWorkflowModal } from '../components/RunWorkflowModal';

const STATUS_COLORS: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
  cancelled: 'warning',
  skipped: 'default',
  waiting_approval: 'gold',
};

function formatDate(dateStr?: string) {
  if (!dateStr) {return '-';}
  return new Date(dateStr).toLocaleString();
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

export default function WorkflowDefinitionDetail() {
  const { workflowId: encodedId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = useUIMessage();

  const workflowId = encodedId ? decodeURIComponent(encodedId) : '';
  const [runModalOpen, setRunModalOpen] = React.useState(false);

  const { data: workflowDef, isLoading: workflowLoading } = useData<WorkflowInfo>(
    workflowId ? `/v1/workflows/${encodeURIComponent(workflowId)}` : '/v1/workflows/__none__',
    { enabled: !!workflowId },
  );

  const { data: runsData, isLoading: runsLoading } = useData<{ runs: WorkflowRunInfo[] }>(
    workflowId ? `/v1/workflows/${encodeURIComponent(workflowId)}/runs` : '/v1/workflows/__none__/runs',
    { enabled: !!workflowId, pollingMs: 5000, params: { limit: 50 } },
  );

  const cancelRunMutation = useMutateData<string, void>('/v1/runs/cancel');
  const runWorkflowMutation = useMutateData<Record<string, unknown>, { runId: string }>(
    `/v1/workflows/${encodeURIComponent(workflowId)}/run`,
  );

  const runsColumns = [
    {
      title: 'Run ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      render: (id: string) => (
        <UITypographyText
          className="typo-caption"
          code
          ellipsis={{ tooltip: id }}
          style={{ cursor: 'pointer', color: 'var(--color-link)' }}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            navigate(`/workflows/runs/${id}`);
          }}
        >
          {id.slice(0, 16)}...
        </UITypographyText>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => (
        <UITag color={STATUS_COLORS[status] ?? 'default'}>{status.toUpperCase()}</UITag>
      ),
    },
    {
      title: 'Triggered By',
      dataIndex: 'trigger',
      key: 'user',
      width: 160,
      render: (trigger?: { user?: string }) => (
        <UITypographyText className="typo-caption text-secondary">{trigger?.user ?? '-'}</UITypographyText>
      ),
    },
    {
      title: 'Started At',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 180,
      render: (date?: string) => (
        <UITypographyText className="typo-caption">{formatDate(date)}</UITypographyText>
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
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: WorkflowRunInfo) => {
        const canCancel = record.status === 'running' || record.status === 'pending';
        if (!canCancel) {return null;}
        return (
          <UIButton
            variant="link"
            size="small"
            danger
            icon={<UIIcon name="StopOutlined" />}
            loading={cancelRunMutation.isLoading}
            onClick={(e) => {
              e.stopPropagation();
              cancelRunMutation.mutate(record.id);
            }}
          >
            Cancel
          </UIButton>
        );
      },
    },
  ];

  if (workflowLoading) {
    return (
      <UIPage>
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <UISpin size="large" />
        </div>
      </UIPage>
    );
  }

  if (!workflowDef) {
    return (
      <UIPage>
        <UIEmptyState
          description={`Workflow "${workflowId}" not found`}
          action={
            <UIButton onClick={() => navigate('/workflows/definitions')}>Back to Definitions</UIButton>
          }
        />
      </UIPage>
    );
  }

  return (
    <UIPage>
      {contextHolder}
      <UIPageHeader
        title={workflowDef.name}
        description={workflowDef.description}
        icon={<UIIcon name="ThunderboltOutlined" />}
        breadcrumbs={[
          { title: 'Home', href: '/' },
          { title: 'Workflows', href: '/workflows' },
          { title: 'Definitions', href: '/workflows/definitions' },
          { title: workflowDef.name },
        ]}
        actions={
          <UIButton
            variant="primary"
            icon={<UIIcon name="PlayCircleOutlined" />}
            onClick={() => setRunModalOpen(true)}
          >
            Run
          </UIButton>
        }
      />

      <UICard style={{ marginBottom: 'var(--spacing-section)' }}>
        <UIDescriptions
          column={3}
          items={[
            {
              key: 'id',
              label: 'ID',
              children: (
                <UITypographyText code className="typo-caption">{workflowDef.id}</UITypographyText>
              ),
            },
            {
              key: 'source',
              label: 'Source',
              children: (
                <UITag color={workflowDef.source === 'manifest' ? 'blue' : 'green'}>
                  {workflowDef.source === 'manifest' ? 'Plugin' : 'Standalone'}
                </UITag>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              children: workflowDef.status ? (
                <UITag color={workflowDef.status === 'active' ? 'success' : 'default'}>
                  {workflowDef.status.toUpperCase()}
                </UITag>
              ) : '-',
            },
            {
              key: 'plugin',
              label: 'Plugin',
              children: (
                <UITypographyText className="typo-caption">
                  {workflowDef.pluginId ?? '-'}
                </UITypographyText>
              ),
            },
            {
              key: 'tags',
              label: 'Tags',
              span: 2,
              children: workflowDef.tags && workflowDef.tags.length > 0 ? (
                <UISpace className="gap-tight">
                  {workflowDef.tags.map((tag) => (
                    <UITag key={tag}>{tag}</UITag>
                  ))}
                </UISpace>
              ) : '-',
            },
          ]}
        />
      </UICard>

      <UICard
        title={
          <UITypographyText className="typo-card-title">Recent Runs</UITypographyText>
        }
      >
        <UITable
          dataSource={runsData?.runs ?? []}
          columns={runsColumns}
          loading={runsLoading}
          rowKey="id"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20 }}
          onRow={(record: WorkflowRunInfo) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/workflows/runs/${record.id}`),
          })}
        />
      </UICard>

      <RunWorkflowModal
        open={runModalOpen}
        workflow={workflowDef}
        loading={runWorkflowMutation.isLoading}
        onClose={() => setRunModalOpen(false)}
        onRun={(_workflowId, input) => runWorkflowMutation.mutate(input)}
      />
    </UIPage>
  );
}
