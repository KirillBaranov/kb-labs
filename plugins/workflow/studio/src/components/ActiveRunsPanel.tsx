/**
 * @module @kb-labs/studio-app/modules/workflows/components/active-runs-panel
 * Always-visible panel showing actively running workflows with clickable links
 */

import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  UIList,
  UIListItem,
  UIListItemMeta,
  UIProgress,
  UISpace,
  UITypographyText,
  UIButton,
  UIIcon,
  UIAlert,
  UICard,
} from '@kb-labs/sdk/studio';
import { useData, useMutateData } from '@kb-labs/sdk/studio';
import { useUIMessage } from '@kb-labs/sdk/studio';
import type { DashboardStatsResponse } from '@kb-labs/workflow-contracts';

export function ActiveRunsPanel() {
  const [messageApi, contextHolder] = useUIMessage();

  const { data: stats, isLoading, refetch } = useData<DashboardStatsResponse>('/v1/stats', {
    pollingMs: 3000,
  });

  const activeExecutions = stats?.activeExecutions || [];
  const hasRunningJobs = activeExecutions.length > 0;

  const hasPendingApprovals = activeExecutions.some(
    (ex) => (ex as { status: string }).status === 'waiting_approval'
  );

  const cancelMutation = useMutateData<string, void>('/v1/runs/cancel');

  // Handle cancel success
  const handleCancel = async (runId: string) => {
    try {
      await cancelMutation.mutateAsync(runId);
      messageApi.success(`Run ${runId.slice(0, 8)} cancelled`);
      void refetch();
    } catch (error) {
      messageApi.error(`Failed to cancel: ${(error as Error).message}`);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) {return '-';}
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {return `${seconds}s`;}
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {return `${minutes}m ${seconds % 60}s`;}
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <>
      {contextHolder}

      {hasPendingApprovals && (
        <UIAlert
          variant="warning"
          message="Waiting for your approval"
          description="One or more workflow steps require your decision."
          showIcon
          style={{ marginBottom: 'var(--spacing-card)' }}
        />
      )}

      <UICard
        title={
          <UISpace className="gap-item">
            <UITypographyText className="typo-card-title">
              Active Runs ({activeExecutions.length})
            </UITypographyText>
            <UIButton
              variant="text"
              size="small"
              icon={<UIIcon name="ReloadOutlined" spin={isLoading} />}
              onClick={() => refetch()}
            />
          </UISpace>
        }
        style={{ marginBottom: 'var(--spacing-section)' }}
      >
        {hasRunningJobs ? (
          <UIList
            dataSource={activeExecutions}
            renderItem={(execution) => (
              <UIListItem
                actions={[
                  <UIButton
                    key="cancel"
                    variant="text"
                    size="small"
                    danger
                    icon={<UIIcon name="StopOutlined" />}
                    loading={cancelMutation.isLoading}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelMutation.mutate(execution.id);
                    }}
                  >
                    Cancel
                  </UIButton>,
                ]}
              >
                <UIListItemMeta
                  title={
                    <Link
                      to={`/workflows/runs/${execution.id}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <UISpace>
                        <UITypographyText className="typo-body" style={{ color: 'var(--color-link)' }}>
                          {execution.workflowName || execution.type}
                        </UITypographyText>
                        {execution.progress !== undefined && (
                          <UITypographyText className="typo-caption text-secondary">
                            {execution.progress}%
                          </UITypographyText>
                        )}
                      </UISpace>
                    </Link>
                  }
                  description={
                    <UISpace direction="vertical" className="gap-tight" style={{ width: '100%' }}>
                      {execution.progressMessage && (
                        <UITypographyText className="typo-description">{execution.progressMessage}</UITypographyText>
                      )}
                      <UISpace className="gap-item">
                        <UIIcon name="ClockCircleOutlined" className="text-secondary" />
                        <UITypographyText className="typo-caption text-secondary">
                          {formatDuration(execution.durationMs)}
                        </UITypographyText>
                        <UITypographyText className="typo-caption text-tertiary">
                          ID: {execution.id.slice(0, 8)}
                        </UITypographyText>
                      </UISpace>
                    </UISpace>
                  }
                />
                {execution.progress !== undefined && (
                  <UIProgress
                    percent={execution.progress}
                    size="small"
                    status="active"
                    style={{ width: 120 }}
                  />
                )}
              </UIListItem>
            )}
          />
        ) : (
          <UITypographyText className="typo-description text-secondary">
            No active runs
          </UITypographyText>
        )}
      </UICard>
    </>
  );
}
