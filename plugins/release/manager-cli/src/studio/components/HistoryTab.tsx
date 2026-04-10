/**
 * History Tab — Timeline of past releases with details
 */

import { useState } from 'react';
import {
  UICard,
  UIEmptyState,
  UISpin,
  UITimeline,
  UITypographyText,
  UITitle,
  UITag,
  UIButton,
  UIModal,
  UIDescriptions,
  UIDescriptionsItem,
  UITabs,
  UISpace,
  UIIcon,
  UIMarkdownViewer,
} from '@kb-labs/sdk/studio';
import { useData } from '@kb-labs/sdk/studio';
import type { HistoryResponse, HistoryReportResponse, HistoryPlanResponse, HistoryChangelogResponse } from '@kb-labs/release-manager-contracts';

interface HistoryTabProps {
  selectedScope: string;
}

interface HistoryDetailPanelProps {
  releaseId: string;
  releaseScope: string;
}

function HistoryDetailPanel({ releaseId, releaseScope }: HistoryDetailPanelProps) {
  const { data: reportData } = useData<HistoryReportResponse>(
    `/v1/plugins/release/history/${encodeURIComponent(releaseScope)}/${encodeURIComponent(releaseId)}/report`,
  );
  const { data: planData } = useData<HistoryPlanResponse>(
    `/v1/plugins/release/history/${encodeURIComponent(releaseScope)}/${encodeURIComponent(releaseId)}/plan`,
  );
  const { data: changelogData } = useData<HistoryChangelogResponse>(
    `/v1/plugins/release/history/${encodeURIComponent(releaseScope)}/${encodeURIComponent(releaseId)}/changelog`,
  );

  const tabItems = [
    {
      key: 'report',
      label: 'Report',
      children: reportData?.report ? (
        <UIDescriptions bordered column={1} size="small">
          <UIDescriptionsItem label="Release ID">{reportData.id}</UIDescriptionsItem>
          <UIDescriptionsItem label="Scope">{reportData.report.scope}</UIDescriptionsItem>
          <UIDescriptionsItem label="Stage">{reportData.report.stage}</UIDescriptionsItem>
          <UIDescriptionsItem label="Timestamp">
            {new Date(reportData.report.ts).toLocaleString()}
          </UIDescriptionsItem>
          <UIDescriptionsItem label="Status">
            <UITag color={reportData.report.result?.ok ? 'success' : 'error'}>
              {reportData.report.result?.ok ? 'Success' : 'Failed'}
            </UITag>
          </UIDescriptionsItem>
          {reportData.report.result?.timingMs && (
            <UIDescriptionsItem label="Duration">{reportData.report.result.timingMs}ms</UIDescriptionsItem>
          )}
          {reportData.report.result?.published && (
            <UIDescriptionsItem label="Packages Published">
              {reportData.report.result.published.length}
            </UIDescriptionsItem>
          )}
        </UIDescriptions>
      ) : <UISpin />,
    },
    {
      key: 'plan',
      label: 'Plan',
      children: planData?.plan ? (
        <div>
          <UIDescriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
            <UIDescriptionsItem label="Scope">{planData.plan.scope}</UIDescriptionsItem>
            <UIDescriptionsItem label="Strategy">{planData.plan.strategy}</UIDescriptionsItem>
            <UIDescriptionsItem label="Packages">{planData.plan.packages.length}</UIDescriptionsItem>
            <UIDescriptionsItem label="Rollback">
              {planData.plan.rollbackEnabled ? 'Enabled' : 'Disabled'}
            </UIDescriptionsItem>
          </UIDescriptions>
          {planData.plan.packages.map((pkg, idx) => (
            <UICard key={idx} size="small" style={{ marginBottom: 8 }}>
              <UISpace direction="vertical" size="small">
                <UITypographyText strong>{pkg.name}</UITypographyText>
                <UISpace>
                  <UITag color="blue">{pkg.currentVersion}</UITag>
                  →
                  <UITag color="green">{pkg.nextVersion}</UITag>
                  <UITag>{pkg.bump}</UITag>
                </UISpace>
                <UITypographyText type="secondary">{pkg.reason}</UITypographyText>
              </UISpace>
            </UICard>
          ))}
        </div>
      ) : <UISpin />,
    },
    {
      key: 'changelog',
      label: 'Changelog',
      children: changelogData?.markdown ? (
        <UIMarkdownViewer content={changelogData.markdown} />
      ) : <UISpin />,
    },
  ];

  return <UITabs items={tabItems} />;
}

export function HistoryTab({ selectedScope }: HistoryTabProps) {
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [selectedReleaseScope, setSelectedReleaseScope] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);

  const { data: historyData, isLoading: historyLoading, error: historyError } = useData<HistoryResponse>(
    '/v1/plugins/release/history',
  );

  const handleViewDetails = (id: string, scope: string) => {
    setSelectedReleaseId(id);
    setSelectedReleaseScope(scope);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedReleaseId(null);
    setSelectedReleaseScope('');
  };

  if (historyLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (historyError) {
    return (
      <UICard>
        <UIEmptyState
          description={`Failed to load history: ${historyError instanceof Error ? historyError.message : 'Unknown error'}`}
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
        />
      </UICard>
    );
  }

  const filteredReleases = historyData?.releases
    ? selectedScope
      ? historyData.releases.filter((r) => r.scope === selectedScope)
      : historyData.releases
    : [];

  if (filteredReleases.length === 0) {
    return (
      <UICard>
        <UIEmptyState
          description={selectedScope ? `No release history for scope "${selectedScope}" yet` : 'No release history yet'}
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
        />
      </UICard>
    );
  }

  const timelineItems = filteredReleases.map((release) => ({
    dot: release.success
      ? <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
      : <UIIcon name="CloseCircleOutlined" style={{ color: '#ff4d4f' }} />,
    children: (
      <UICard size="small" style={{ marginBottom: 16 }}>
        <UISpace direction="vertical" style={{ width: '100%' }}>
          <UISpace>
            <UITag color="blue">{release.scope}</UITag>
            <UITag color={release.success ? 'success' : 'error'}>{release.success ? 'Success' : 'Failed'}</UITag>
            <UITypographyText type="secondary">{new Date(release.timestamp).toLocaleString()}</UITypographyText>
          </UISpace>
          <UITypographyText>Released {release.packages.length} package(s)</UITypographyText>
          <UIButton
            icon={<UIIcon name="EyeOutlined" />}
            onClick={() => handleViewDetails(release.id, release.scope)}
            size="small"
          >
            View Details
          </UIButton>
        </UISpace>
      </UICard>
    ),
  }));

  return (
    <UICard title={<UITitle level={4} style={{ margin: 0 }}>Release History</UITitle>}>
      <UITimeline items={timelineItems} />

      <UIModal
        title={`Release Details - ${selectedReleaseId}`}
        open={modalVisible}
        onCancel={handleModalClose}
        footer={null}
        width={800}
      >
        {selectedReleaseId && selectedReleaseScope && (
          <HistoryDetailPanel releaseId={selectedReleaseId} releaseScope={selectedReleaseScope} />
        )}
      </UIModal>
    </UICard>
  );
}
