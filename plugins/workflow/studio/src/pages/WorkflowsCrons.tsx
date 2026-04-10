/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflows-crons-page
 * Cron jobs list - standalone page
 */

import * as React from 'react';
import {
  UITable,
  UITag,
  UISpace,
  UITypographyText,
  UIBadge,
  UIIcon,
} from '@kb-labs/sdk/studio';
import { useData } from '@kb-labs/sdk/studio';
import { UICard } from '@kb-labs/sdk/studio';
import { UIPage, UIPageHeader } from '@kb-labs/sdk/studio';

export default function WorkflowsCrons() {
  const { data: cronsData, isLoading } = useData<{ crons: Array<Record<string, unknown>> }>('/v1/crons');

  const formatDate = (date?: Date | string) => {
    if (!date) {return '-';}
    return new Date(date).toLocaleString();
  };

  const columns = [
    {
      title: 'Cron ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <UITypographyText className="typo-body" strong>{id}</UITypographyText>
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (schedule: string) => (
        <UISpace className="gap-tight">
          <UIIcon name="ClockCircleOutlined" className="text-secondary" />
          <UITypographyText className="typo-caption" code>{schedule}</UITypographyText>
        </UISpace>
      ),
    },
    {
      title: 'Job Type',
      dataIndex: 'jobType',
      key: 'jobType',
      render: (jobType: string) => (
        <UITypographyText className="typo-body">{jobType}</UITypographyText>
      ),
    },
    {
      title: 'Timezone',
      dataIndex: 'timezone',
      key: 'timezone',
      render: (timezone?: string) => (
        <UITypographyText className="typo-caption">{timezone || 'UTC'}</UITypographyText>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <UIBadge variant={enabled ? 'success' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </UIBadge>
      ),
    },
    {
      title: 'Last Run',
      dataIndex: 'lastRun',
      key: 'lastRun',
      render: (date?: Date | string) => (
        <UISpace className="gap-tight">
          <UIIcon name="CalendarOutlined" className="text-secondary" />
          <UITypographyText className="typo-caption">{formatDate(date)}</UITypographyText>
        </UISpace>
      ),
    },
    {
      title: 'Next Run',
      dataIndex: 'nextRun',
      key: 'nextRun',
      render: (date?: Date | string) => (
        date ? (
          <UISpace className="gap-tight">
            <UIIcon name="CalendarOutlined" className="text-info" />
            <UITypographyText className="typo-caption">{formatDate(date)}</UITypographyText>
          </UISpace>
        ) : (
          <UITypographyText className="typo-caption text-tertiary">-</UITypographyText>
        )
      ),
    },
    {
      title: 'Plugin',
      dataIndex: 'pluginId',
      key: 'pluginId',
      render: (pluginId?: string) => (
        pluginId ? (
          <UITag color="blue">{pluginId}</UITag>
        ) : (
          <UITypographyText className="typo-caption text-tertiary">-</UITypographyText>
        )
      ),
    },
  ];

  const enabledCount = cronsData?.crons?.filter((c) => c.enabled).length || 0;
  const disabledCount = cronsData?.crons?.filter((c) => !c.enabled).length || 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Cron Jobs"
        description="Scheduled recurring tasks"
        icon={<UIIcon name="ClockCircleOutlined" />}
        breadcrumbs={[
          { title: 'Home', href: '/' },
          { title: 'Workflows', href: '/workflows' },
          { title: 'Crons' },
        ]}
      />

      <UICard style={{ marginBottom: 'var(--spacing-section)' }}>
        <UISpace className="gap-section">
          <div>
            <UITypographyText className="typo-label text-secondary">Total Cron Jobs</UITypographyText>
            <div>
              <UITypographyText className="typo-section-title">{cronsData?.crons?.length || 0}</UITypographyText>
            </div>
          </div>
          <div>
            <UITypographyText className="typo-label text-secondary">Enabled</UITypographyText>
            <div>
              <UITypographyText className="typo-section-title text-success">{enabledCount}</UITypographyText>
            </div>
          </div>
          <div>
            <UITypographyText className="typo-label text-secondary">Disabled</UITypographyText>
            <div>
              <UITypographyText className="typo-section-title">{disabledCount}</UITypographyText>
            </div>
          </div>
        </UISpace>
      </UICard>

      <UICard>
        <UITable
          dataSource={cronsData?.crons || []}
          columns={columns}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </UICard>
    </UIPage>
  );
}
